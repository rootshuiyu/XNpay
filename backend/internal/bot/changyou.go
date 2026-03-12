package bot

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"regexp"
	"strings"
	"time"

	"xinipay/internal/model"
)

type ChangyouPlatform struct {
	BaseURL string
}

func init() {
	RegisterPlatform(&ChangyouPlatform{
		BaseURL: "https://chong.changyou.com",
	})
}

func (p *ChangyouPlatform) Name() string {
	return "changyou"
}

func (p *ChangyouPlatform) Login(account *model.GameAccount, proxy string, ua string) (*Session, error) {
	jar, _ := cookiejar.New(nil)
	client := BuildHTTPClient(proxy, ua)
	client.Jar = jar
	// 允许跟随重定向
	client.CheckRedirect = nil

	// Step 1: 获取登录页面，提取 loginToken (畅游通行证迁移到 auth.changyou.com)
	loginPageURL := "https://auth.changyou.com/new_login.jsp?s=" + url.QueryEscape(p.BaseURL+"/")
	req1, err := http.NewRequest("GET", loginPageURL, nil)
	if err != nil {
		return nil, fmt.Errorf("构建登录页请求失败: %w", err)
	}
	req1.Header.Set("User-Agent", ua)
	req1.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
	req1.Header.Set("Referer", "https://auth.changyou.com/loginpage")

	resp1, err := client.Do(req1)
	if err != nil {
		return nil, fmt.Errorf("获取登录页失败: %w", err)
	}
	defer resp1.Body.Close()
	loginPageBody, _ := io.ReadAll(resp1.Body)
	loginPageHTML := string(loginPageBody)
	log.Printf("[BOT-CHANGYOU] Login page status: %d, len: %d", resp1.StatusCode, len(loginPageHTML))

	// 提取 loginToken
	loginToken := extractLoginToken(loginPageHTML)
	if loginToken == "" {
		return nil, fmt.Errorf("无法获取 loginToken，响应片段: %s", truncate(loginPageHTML, 400))
	}
	log.Printf("[BOT-CHANGYOU] Got loginToken: %s", truncate(loginToken, 40))

	// Step 2: 提交登录表单到 auth.changyou.com/login
	formData := url.Values{
		"cn":            {account.AccountName},
		"password":      {account.Password},
		"loginToken":    {loginToken},
		"s":             {p.BaseURL + "/"},
		"inputCnTime":   {fmt.Sprintf("%d", time.Now().UnixMilli())},
		"theme":         {"null"},
		"imageId":       {""},
		"isMiddleLogin": {""},
	}

	loginSubmitURL := "https://auth.changyou.com/login"
	req2, err := http.NewRequest("POST", loginSubmitURL, strings.NewReader(formData.Encode()))
	if err != nil {
		return nil, fmt.Errorf("构建登录请求失败: %w", err)
	}
	req2.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req2.Header.Set("User-Agent", ua)
	req2.Header.Set("Referer", "https://auth.changyou.com/loginpage")
	req2.Header.Set("Origin", "https://auth.changyou.com")
	req2.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")

	resp2, err := client.Do(req2)
	if err != nil {
		return nil, fmt.Errorf("登录请求失败: %w", err)
	}
	defer resp2.Body.Close()
	loginBody, _ := io.ReadAll(resp2.Body)
	loginHTML := string(loginBody)

	log.Printf("[BOT-CHANGYOU] Login submit status: %d, final URL: %s, body len: %d, body: %s",
		resp2.StatusCode, resp2.Request.URL.String(), len(loginHTML), truncate(loginHTML, 300))

	// 检查登录是否失败
	if strings.Contains(loginHTML, "密码不正确") || strings.Contains(loginHTML, "账号不存在") ||
		strings.Contains(loginHTML, "帐号或密码") || strings.Contains(loginHTML, "loginToken") ||
		strings.Contains(loginHTML, "new_login.jsp") {
		return nil, fmt.Errorf("账号密码错误或登录失败: %s", truncate(loginHTML, 300))
	}

	// 处理 JS 重定向：auth.changyou.com 成功登录后可能通过 JS 跳转回 s 参数指定的 URL
	// 需要手动跟随 JS 中的 location.href 或 window.location
	if strings.Contains(loginHTML, "location.href") || strings.Contains(loginHTML, "window.location") {
		jsRedirectURL := extractJSRedirectURL(loginHTML)
		if jsRedirectURL != "" {
			log.Printf("[BOT-CHANGYOU] Following JS redirect to: %s", jsRedirectURL)
			reqJS, _ := http.NewRequest("GET", jsRedirectURL, nil)
			reqJS.Header.Set("User-Agent", ua)
			reqJS.Header.Set("Referer", "https://auth.changyou.com/login")
			reqJS.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
			respJS, err := client.Do(reqJS)
			if err != nil {
				log.Printf("[BOT-CHANGYOU] JS redirect failed: %v", err)
			} else {
				defer respJS.Body.Close()
				jsBody, _ := io.ReadAll(respJS.Body)
				log.Printf("[BOT-CHANGYOU] JS redirect result: status=%d, url=%s, len=%d",
					respJS.StatusCode, respJS.Request.URL.String(), len(jsBody))
			}
		}
	}

	// Step 3: 访问充值初始化页面，建立充值域的 session
	initURL := fmt.Sprintf("%s/tl/tlBankInit.do?chnlType=alipay", p.BaseURL)
	req3, _ := http.NewRequest("GET", initURL, nil)
	req3.Header.Set("User-Agent", ua)
	req3.Header.Set("Referer", p.BaseURL+"/")
	req3.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")

	resp3, err := client.Do(req3)
	if err != nil {
		return nil, fmt.Errorf("初始化充值页失败: %w", err)
	}
	defer resp3.Body.Close()
	initBody, _ := io.ReadAll(resp3.Body)
	log.Printf("[BOT-CHANGYOU] Init page status: %d, body len: %d", resp3.StatusCode, len(initBody))

	// 收集所有相关域的 Cookie
	baseU, _ := url.Parse(p.BaseURL)
	authU, _ := url.Parse("https://auth.changyou.com")
	memberU, _ := url.Parse("https://member.changyou.com")
	allCookies := jar.Cookies(baseU)
	allCookies = append(allCookies, jar.Cookies(authU)...)
	allCookies = append(allCookies, jar.Cookies(memberU)...)

	if len(allCookies) == 0 {
		return nil, fmt.Errorf("登录后未获取到 Cookie，可能登录失败。响应: %s", truncate(loginHTML, 300))
	}

	session := &Session{
		AccountID: account.ID,
		Platform:  p.Name(),
		Cookies:   allCookies,
		UserAgent: ua,
		ProxyAddr: proxy,
		LoginAt:   time.Now(),
		ExpireAt:  time.Now().Add(30 * time.Minute),
	}

	log.Printf("[BOT-CHANGYOU] Account %s login success, cookies: %d", account.AccountName, len(allCookies))
	return session, nil
}

// extractJSRedirectURL 从 JS 代码中提取 location.href 的 URL
func extractJSRedirectURL(html string) string {
	re := regexp.MustCompile(`(?:location\.href|window\.location)\s*=\s*["']([^"']+)["']`)
	m := re.FindStringSubmatch(html)
	if len(m) > 1 {
		return m[1]
	}
	return ""
}

// extractLoginToken 从登录页 HTML 中提取 loginToken 隐藏字段值
func extractLoginToken(html string) string {
	re := regexp.MustCompile(`name="loginToken"\s+value="([^"]+)"`)
	m := re.FindStringSubmatch(html)
	if len(m) > 1 {
		return m[1]
	}
	// 备用匹配
	re2 := regexp.MustCompile(`value="(LT-[^"]+)"`)
	m2 := re2.FindStringSubmatch(html)
	if len(m2) > 1 {
		return m2[1]
	}
	return ""
}

func (p *ChangyouPlatform) CreateOrder(session *Session, amount float64) (*GameOrder, error) {
	points := amountToPoints(amount)
	if points < 20 || points > 2000000 || points%20 != 0 {
		return nil, fmt.Errorf("金额 %.2f 转换点数 %d 不符合要求（需为20的倍数，20-2000000）", amount, points)
	}

	jar, _ := cookiejar.New(nil)
	client := BuildHTTPClient(session.ProxyAddr, session.UserAgent)
	client.Jar = jar
	client.CheckRedirect = nil

	baseU, _ := url.Parse(p.BaseURL)
	jar.SetCookies(baseU, session.Cookies)
	authU2, _ := url.Parse("https://auth.changyou.com")
	jar.SetCookies(authU2, session.Cookies)

	orderCount := 1
	pointValue := points

	bestPoint, bestCount := findBestPointCombo(points)
	if bestPoint > 0 {
		pointValue = bestPoint
		orderCount = bestCount
	}

	cardCount := pointValue / 20 // 每张卡20点，此字段为卡张数

	// 关键步骤：先访问 tlBankInit.do，建立支付宝充值 session 状态
	// 服务端需要通过此页面知道用户正在进行支付宝充值，否则 confirmCardOrders.do 会返回渠道选择页
	initURL2 := fmt.Sprintf("%s/tl/tlBankInit.do?chnlType=alipay", p.BaseURL)
	reqInit, _ := http.NewRequest("GET", initURL2, nil)
	reqInit.Header.Set("User-Agent", session.UserAgent)
	reqInit.Header.Set("Referer", p.BaseURL+"/")
	reqInit.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
	respInit, err := client.Do(reqInit)
	if err != nil {
		return nil, fmt.Errorf("初始化充值 session 失败: %w", err)
	}
	defer respInit.Body.Close()
	initBody2, _ := io.ReadAll(respInit.Body)
	initHTML2 := string(initBody2)
	log.Printf("[BOT-CHANGYOU] CreateOrder tlBankInit: status=%d, len=%d, url=%s",
		respInit.StatusCode, len(initHTML2), respInit.Request.URL.String())
	// 完整输出 GET 响应（分3段），找到真正的表单字段
	log.Printf("[BOT-CHANGYOU] tlBankInit GET [0-1500]: %s", truncate(initHTML2, 1500))
	if len(initHTML2) > 1500 {
		log.Printf("[BOT-CHANGYOU] tlBankInit GET [1500-end]: %s", truncate(initHTML2[1500:], 3500))
	}

	// 如果被重定向到登录页说明 session 失效
	if strings.Contains(initHTML2, "loginpage") || strings.Contains(initHTML2, "login.jsp") {
		return nil, fmt.Errorf("充值 session 已失效，需要重新登录")
	}

	// 从 tlBankInit.do 响应中提取 gameType 和 chnl（页面已加载）
	gameTypeInit := extractHiddenField(initHTML2, "cardOrders.gameType")
	chnlInit := extractHiddenField(initHTML2, "cardOrders.chnl")
	if gameTypeInit == "" {
		// 从页面中的 sidebar 链接提取 gameType（备用）
		gameTypeInit = "5073"
	}
	if chnlInit == "" {
		chnlInit = "235"
	}
	log.Printf("[BOT-CHANGYOU] Using gameType=%s, chnl=%s, cardCount=%d, orderCount=%d",
		gameTypeInit, chnlInit, cardCount, orderCount)

	// 步骤2: POST 到 tlBankInit.do (form action="" = 提交回同一URL) 提交充值参数
	// 这会返回含 cardOrders.id 的订单确认页
	initPostURL := fmt.Sprintf("%s/tl/tlBankInit.do?chnlType=alipay", p.BaseURL)
	formData := url.Values{
		"cardOrders.gameType":  {gameTypeInit},
		"cardOrders.chnl":      {chnlInit},
		"chnlType":             {"alipay"},
		"cardOrders.cardCount": {fmt.Sprintf("%d", cardCount)},
		"orderCount":           {fmt.Sprintf("%d", orderCount)},
	}

	reqPost, err := http.NewRequest("POST", initPostURL, strings.NewReader(formData.Encode()))
	if err != nil {
		return nil, fmt.Errorf("构建下单POST请求失败: %w", err)
	}
	reqPost.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	reqPost.Header.Set("User-Agent", session.UserAgent)
	reqPost.Header.Set("Referer", initPostURL)
	reqPost.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
	reqPost.Header.Set("Origin", p.BaseURL)

	respPost, err := client.Do(reqPost)
	if err != nil {
		return nil, fmt.Errorf("提交下单POST失败: %w", err)
	}
	defer respPost.Body.Close()
	postBody, _ := io.ReadAll(respPost.Body)
	postHTML := string(postBody)

	log.Printf("[BOT-CHANGYOU] tlBankInit POST response: status=%d, body_len=%d, url=%s",
		respPost.StatusCode, len(postHTML), respPost.Request.URL.String())
	// 完整输出（分段），用于调试
	log.Printf("[BOT-CHANGYOU] tlBankInit POST body [0-1500]: %s", truncate(postHTML, 1500))
	if len(postHTML) > 1500 {
		mid := postHTML[1500:]
		log.Printf("[BOT-CHANGYOU] tlBankInit POST body [1500-end]: %s", truncate(mid, 3000))
	}

	// 先尝试从 tlBankInit POST 结果中提取订单ID
	var html string
	orderID := extractHiddenField(postHTML, "cardOrders.id")

	if orderID != "" {
		// tlBankInit POST 直接返回了确认页（含 cardOrders.id）
		html = postHTML
		log.Printf("[BOT-CHANGYOU] Order ID found in tlBankInit POST response: %s", orderID)
	} else {
		// tlBankInit POST 返回了中间页，需要再 POST 到 confirmCardOrders.do
		log.Printf("[BOT-CHANGYOU] No order ID in tlBankInit POST, trying confirmCardOrders.do")
		confirmURL := fmt.Sprintf("%s/tl/confirmCardOrders.do", p.BaseURL)
		req2, err2 := http.NewRequest("POST", confirmURL, strings.NewReader(formData.Encode()))
		if err2 != nil {
			return nil, fmt.Errorf("构建 confirmCardOrders 请求失败: %w", err2)
		}
		req2.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		req2.Header.Set("User-Agent", session.UserAgent)
		req2.Header.Set("Referer", initPostURL)
		req2.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
		req2.Header.Set("Origin", p.BaseURL)

		resp2, err2 := client.Do(req2)
		if err2 != nil {
			return nil, fmt.Errorf("confirmCardOrders 请求失败: %w", err2)
		}
		defer resp2.Body.Close()
		body2, _ := io.ReadAll(resp2.Body)
		html = string(body2)
		orderID = extractHiddenField(html, "cardOrders.id")

		log.Printf("[BOT-CHANGYOU] confirmCardOrders response: status=%d, body_len=%d, url=%s",
			resp2.StatusCode, len(html), resp2.Request.URL.String())
		log.Printf("[BOT-CHANGYOU] confirmCardOrders body preview: %s", truncate(html, 1200))
	}

	spsn := extractHiddenField(html, "cardOrders.spsn")
	sign := extractHiddenField(html, "cardOrders.sign")
	cash := extractHiddenField(html, "cardOrders.cash")
	cnMaster := extractHiddenField(html, "cardOrders.cnMaster")
	chnl := extractHiddenField(html, "cardOrders.chnl")
	gameType := extractHiddenField(html, "cardOrders.gameType")
	cardType := extractHiddenField(html, "cardOrders.cardType")
	cardPwd := extractHiddenField(html, "cardOrders.cardPwd")
	orderCountInfo := extractHiddenField(html, "orderCountInfo")

	if orderID == "" {
		return nil, fmt.Errorf("下单失败，未获取到订单ID\ntlBankInit POST(%d字节): %s\nconfirmCardOrders(%d字节): %s",
			len(postHTML), truncate(postHTML, 300), len(html), truncate(html, 300))
	}

	// !!!关键修复：下单后更新 session.Cookies，保存服务端 session 状态
	// getQr.do 依赖服务端知道当前是哪个订单，需要此 session cookie
	updatedCookies := jar.Cookies(baseU)
	if len(updatedCookies) > 0 {
		session.Cookies = updatedCookies
		log.Printf("[BOT-CHANGYOU] Session cookies updated after order creation: %d cookies", len(updatedCookies))
	}

	if chnl == "" {
		chnl = "235"
	}
	if gameType == "" {
		gameType = "5073"
	}

	gameOrder := &GameOrder{
		OrderID:  orderID,
		SerialNo: spsn,
		Amount:   amount,
		FormData: map[string]string{
			"cardOrders.id":        orderID,
			"cardOrders.cnMaster":  cnMaster,
			"cardOrders.spsn":      spsn,
			"cardOrders.sign":      sign,
			"cardOrders.cash":      cash,
			"cardOrders.chnl":      chnl,
			"chnlType":             "alipay",
			"cardOrders.gameType":  gameType,
			"cardOrders.cardCount": fmt.Sprintf("%d", cardCount),
			"cardOrders.cardType":  cardType,
			"cardOrders.cardPwd":   cardPwd,
			"payWayChnlCode":       chnl,
			"orderCountInfo":       orderCountInfo,
		},
	}

	log.Printf("[BOT-CHANGYOU] Order created: ID=%s, SN=%s, cash=%s, chnl=%s", orderID, spsn, cash, chnl)
	return gameOrder, nil
}

func (p *ChangyouPlatform) GetQRCode(session *Session, gameOrder *GameOrder) (string, error) {
	jar, _ := cookiejar.New(nil)
	client := BuildHTTPClient(session.ProxyAddr, session.UserAgent)
	client.Jar = jar
	// 允许 302 跳转
	client.CheckRedirect = func(req *http.Request, via []*http.Request) error {
		if len(via) >= 10 {
			return fmt.Errorf("重定向次数过多")
		}
		return nil
	}

	baseU, _ := url.Parse(p.BaseURL)
	jar.SetCookies(baseU, session.Cookies)

	// 第一步：请求 getQr.do（此页面就是收款二维码的 iframe 内容）
	qrURL := fmt.Sprintf("%s/new/getQr.do", p.BaseURL)
	req, err := http.NewRequest("GET", qrURL, nil)
	if err != nil {
		return "", fmt.Errorf("构建QR请求失败: %w", err)
	}
	req.Header.Set("User-Agent", session.UserAgent)
	req.Header.Set("Referer", p.BaseURL)
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")

	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("获取QR码页面失败: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	html := string(body)

	log.Printf("[BOT-CHANGYOU] getQr.do response: status=%d, len=%d, url=%s",
		resp.StatusCode, len(html), resp.Request.URL.String())
	log.Printf("[BOT-CHANGYOU] getQr.do body: %s", truncate(html, 1000))

	// 多种提取策略
	qrImageURL := ""

	// 策略1: Alipay QR 图片 URL（qr.alipay.com）
	if qrImageURL == "" {
		re := regexp.MustCompile(`https?://qr\.alipay\.com/[^\s"'<>]+`)
		match := re.FindString(html)
		if match != "" {
			qrImageURL = match
			log.Printf("[BOT-CHANGYOU] Found Alipay QR image URL: %s", qrImageURL)
		}
	}

	// 策略2: 找 img 标签中包含 qr 的图片
	if qrImageURL == "" {
		qrImageURL = extractQRImageURL(html)
		if qrImageURL != "" {
			log.Printf("[BOT-CHANGYOU] Found QR image via img tag: %s", qrImageURL)
		}
	}

	// 策略3: 找 script 里的支付宝二维码URL
	if qrImageURL == "" {
		re := regexp.MustCompile(`(?i)(qr_code|qrcode|payUrl|pay_url|alipay_url)['":\s]+['"]?(https?://[^\s"'<>]+)`)
		match := re.FindStringSubmatch(html)
		if len(match) > 2 {
			qrImageURL = match[2]
			log.Printf("[BOT-CHANGYOU] Found QR URL in script: %s", qrImageURL)
		}
	}

	// 策略4: 找 iframe src（可能是 Alipay 的支付 iframe）
	if qrImageURL == "" {
		iframeSrc := extractIframeSrc(html)
		if iframeSrc != "" {
			log.Printf("[BOT-CHANGYOU] Found iframe in getQr.do: %s", iframeSrc)
			// 如果是 Alipay 渲染页面，跟进获取里面的内容
			if strings.Contains(iframeSrc, "alipay.com") || strings.Contains(iframeSrc, "render") {
				innerQR, err := p.followAlipayIframe(client, iframeSrc, session.UserAgent)
				if err == nil && innerQR != "" {
					qrImageURL = innerQR
				}
			} else {
				if !strings.HasPrefix(iframeSrc, "http") {
					iframeSrc = p.BaseURL + iframeSrc
				}
				qrImageURL = iframeSrc
			}
		}
	}

	// 策略5（兜底）: 提交 addAlipayCardOrders.do 表单获取支付宝跳转链接，生成QR
	if qrImageURL == "" && len(gameOrder.FormData) > 0 {
		log.Printf("[BOT-CHANGYOU] Fallback: submitting addAlipayCardOrders.do to get payment URL")
		payURL, err := p.getAlipayPayURL(client, session.UserAgent, gameOrder)
		if err != nil {
			log.Printf("[BOT-CHANGYOU] Fallback failed: %v", err)
		} else if payURL != "" {
			// 将支付宝链接通过 QR 生成服务转换成二维码图片
			qrImageURL = buildQRImageURL(payURL)
			log.Printf("[BOT-CHANGYOU] Generated QR from payment URL: %s", qrImageURL)
		}
	}

	if qrImageURL == "" {
		return "", fmt.Errorf("所有策略均未找到二维码URL，响应内容(前500字): %s", truncate(html, 500))
	}

	// 补全相对路径
	if strings.HasPrefix(qrImageURL, "/") {
		qrImageURL = p.BaseURL + qrImageURL
	}

	log.Printf("[BOT-CHANGYOU] Final QR code URL: %s", qrImageURL)
	return qrImageURL, nil
}

// followAlipayIframe 跟进 Alipay 的 iframe 页面，提取里面的二维码图片
func (p *ChangyouPlatform) followAlipayIframe(client *http.Client, iframeURL, ua string) (string, error) {
	if !strings.HasPrefix(iframeURL, "http") {
		iframeURL = p.BaseURL + iframeURL
	}
	req, err := http.NewRequest("GET", iframeURL, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", ua)
	req.Header.Set("Referer", p.BaseURL)

	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	html := string(body)

	log.Printf("[BOT-CHANGYOU] Alipay iframe content: %s", truncate(html, 500))

	// 从 Alipay iframe 中提取 QR 图片
	re := regexp.MustCompile(`https?://qr\.alipay\.com/[^\s"'<>]+`)
	match := re.FindString(html)
	if match != "" {
		return match, nil
	}

	return extractQRImageURL(html), nil
}

// getAlipayPayURL 提交最终表单 addAlipayCardOrders.do 获取支付宝支付链接
func (p *ChangyouPlatform) getAlipayPayURL(client *http.Client, ua string, gameOrder *GameOrder) (string, error) {
	formData := url.Values{}
	for k, v := range gameOrder.FormData {
		formData.Set(k, v)
	}

	addURL := fmt.Sprintf("%s/tl/addAlipayCardOrders.do", p.BaseURL)
	req, err := http.NewRequest("POST", addURL, strings.NewReader(formData.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("User-Agent", ua)
	req.Header.Set("Referer", p.BaseURL)

	// 不自动跟随重定向，截获重定向 URL
	origRedirect := client.CheckRedirect
	var redirectURL string
	client.CheckRedirect = func(req *http.Request, via []*http.Request) error {
		redirectURL = req.URL.String()
		log.Printf("[BOT-CHANGYOU] Redirect to: %s", redirectURL)
		return http.ErrUseLastResponse // 停止跟随
	}
	defer func() { client.CheckRedirect = origRedirect }()

	resp, err := client.Do(req)
	if err != nil && redirectURL == "" {
		return "", err
	}
	if resp != nil {
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)
		html := string(body)
		log.Printf("[BOT-CHANGYOU] addAlipayCardOrders response: status=%d, len=%d", resp.StatusCode, len(html))

		// 尝试从响应体里找支付 URL
		re := regexp.MustCompile(`(?i)(href|action|location|url)\s*[=:]\s*['"]?(https?://[a-zA-Z0-9./?=&_%#-]+alipay[^\s"'<>]*)`)
		match := re.FindStringSubmatch(html)
		if len(match) > 2 {
			return match[2], nil
		}
	}

	// 优先返回重定向的 URL
	if redirectURL != "" && strings.Contains(redirectURL, "alipay") {
		return redirectURL, nil
	}

	return redirectURL, nil
}

// buildQRImageURL 将支付链接包装成可显示的二维码图片 URL
func buildQRImageURL(payURL string) string {
	encoded := url.QueryEscape(payURL)
	return fmt.Sprintf("https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=%s", encoded)
}

func (p *ChangyouPlatform) CheckPayStatus(session *Session, gameOrder *GameOrder) (*PayStatus, error) {
	jar, _ := cookiejar.New(nil)
	client := BuildHTTPClient(session.ProxyAddr, session.UserAgent)
	client.Jar = jar

	baseU, _ := url.Parse(p.BaseURL)
	jar.SetCookies(baseU, session.Cookies)

	// 按照页面 JS 里 completePay() 的逻辑，构建查询参数
	spsn := gameOrder.FormData["cardOrders.spsn"]
	chnl := gameOrder.FormData["cardOrders.chnl"]
	gameType := gameOrder.FormData["cardOrders.gameType"]
	payWayChnlCode := gameOrder.FormData["payWayChnlCode"]
	if payWayChnlCode == "" {
		payWayChnlCode = chnl
	}
	if gameType == "" {
		gameType = "5073"
	}

	// completePay.do 的查询参数（参考页面 JS: map 变量）
	queryParams := url.Values{
		"gameType":             {gameType},
		"cardOrders.gameType": {gameType},
		"cardOrders.chnl":     {chnl},
		"cardOrders.spsn":     {spsn},
		"payWayChnlCode":      {payWayChnlCode},
	}

	formData := url.Values{
		"chnlType": {"alipay"},
		"costTime": {"0"},
	}

	checkURL := fmt.Sprintf("%s/tl/completePay.do?%s", p.BaseURL, queryParams.Encode())
	req, err := http.NewRequest("POST", checkURL, strings.NewReader(formData.Encode()))
	if err != nil {
		return nil, fmt.Errorf("构建状态查询请求失败: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("User-Agent", session.UserAgent)
	req.Header.Set("Referer", p.BaseURL)

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("状态查询失败: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	html := string(body)

	log.Printf("[BOT-CHANGYOU] completePay response (spsn=%s): status=%d, paid=%v, preview=%s",
		spsn, resp.StatusCode,
		strings.Contains(html, "充值成功") || strings.Contains(html, "支付成功"),
		truncate(html, 300))

	paid := strings.Contains(html, "充值成功") ||
		strings.Contains(html, "支付成功") ||
		strings.Contains(html, "finish_step\">3.充值成功")

	return &PayStatus{
		Paid:   paid,
		Amount: gameOrder.Amount,
	}, nil
}

// --- helpers ---

func amountToPoints(amount float64) int {
	return int(math.Round(amount * 20))
}

var validPoints = []int{100, 300, 600, 800, 2000, 6000, 30000, 50000, 200000, 1000000}

func findBestPointCombo(targetPoints int) (int, int) {
	for _, p := range validPoints {
		if targetPoints%p == 0 {
			count := targetPoints / p
			if count >= 1 && count <= 10 {
				return p, count
			}
		}
	}
	for i := len(validPoints) - 1; i >= 0; i-- {
		p := validPoints[i]
		if targetPoints%p == 0 {
			count := targetPoints / p
			if count >= 1 && count <= 10 {
				return p, count
			}
		}
	}
	return targetPoints, 1
}

func extractHiddenField(html, name string) string {
	pattern := fmt.Sprintf(`name="%s"\s+value="([^"]*)"`, regexp.QuoteMeta(name))
	re := regexp.MustCompile(pattern)
	match := re.FindStringSubmatch(html)
	if len(match) > 1 {
		return match[1]
	}
	pattern2 := fmt.Sprintf(`value="([^"]*)"\s+name="%s"`, regexp.QuoteMeta(name))
	re2 := regexp.MustCompile(pattern2)
	match2 := re2.FindStringSubmatch(html)
	if len(match2) > 1 {
		return match2[1]
	}
	return ""
}

func extractQRImageURL(html string) string {
	patterns := []string{
		`<img[^>]+src="(https?://qr\.alipay\.com/[^"]*)"`,
		`<img[^>]+src="([^"]*)"[^>]*class="[^"]*(?:qr|code)[^"]*"`,
		`<img[^>]+class="[^"]*(?:qr|code)[^"]*"[^>]*src="([^"]*)"`,
		`<img[^>]+src="(https?://[^"]*(?:qr|qrcode|pay)[^"]*\.(png|jpg|jpeg|gif))"`,
		`<img[^>]+id="[^"]*(?:qr|code|wcode)[^"]*"[^>]*src="([^"]*)"`,
		`<img[^>]+src="([^"]*)"[^>]*id="[^"]*(?:qr|code|wcode)[^"]*"`,
	}
	for _, pat := range patterns {
		re := regexp.MustCompile(pat)
		match := re.FindStringSubmatch(html)
		if len(match) > 1 && match[1] != "" {
			return match[1]
		}
	}
	return ""
}

func extractIframeSrc(html string) string {
	re := regexp.MustCompile(`<iframe[^>]+src="([^"]*)"`)
	match := re.FindStringSubmatch(html)
	if len(match) > 1 {
		return match[1]
	}
	return ""
}

func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}

type changyouSessionCookies struct {
	Cookies []cookieData `json:"cookies"`
}

type cookieData struct {
	Name   string `json:"name"`
	Value  string `json:"value"`
	Domain string `json:"domain"`
	Path   string `json:"path"`
}

func serializeCookies(cookies []*http.Cookie) string {
	data := make([]cookieData, 0, len(cookies))
	for _, c := range cookies {
		data = append(data, cookieData{
			Name:   c.Name,
			Value:  c.Value,
			Domain: c.Domain,
			Path:   c.Path,
		})
	}
	b, _ := json.Marshal(changyouSessionCookies{Cookies: data})
	return string(b)
}
