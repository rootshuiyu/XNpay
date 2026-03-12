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
	client.CheckRedirect = nil

	loginURL := "https://passport.changyou.com/accounts/login"

	formData := url.Values{
		"username": {account.AccountName},
		"password": {account.Password},
	}

	req, err := http.NewRequest("POST", loginURL, strings.NewReader(formData.Encode()))
	if err != nil {
		return nil, fmt.Errorf("构建登录请求失败: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("User-Agent", ua)
	req.Header.Set("Referer", "https://passport.changyou.com/")
	req.Header.Set("Origin", "https://passport.changyou.com")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("登录请求失败: %w", err)
	}
	defer resp.Body.Close()
	loginBody, _ := io.ReadAll(resp.Body)

	// 检查是否登录成功
	loginHTML := string(loginBody)
	if strings.Contains(loginHTML, "密码错误") || strings.Contains(loginHTML, "账号不存在") ||
		strings.Contains(loginHTML, "password error") {
		return nil, fmt.Errorf("账号密码错误: %s", truncate(loginHTML, 200))
	}

	log.Printf("[BOT-CHANGYOU] Login response status: %d, redirects to: %s",
		resp.StatusCode, resp.Request.URL.String())

	// 访问充值初始化页面，建立充值域的 session
	initURL := fmt.Sprintf("%s/tl/tlBankInit.do?chnlType=alipay", p.BaseURL)
	req2, _ := http.NewRequest("GET", initURL, nil)
	req2.Header.Set("User-Agent", ua)
	req2.Header.Set("Referer", p.BaseURL)
	req2.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")

	resp2, err := client.Do(req2)
	if err != nil {
		return nil, fmt.Errorf("初始化充值页失败: %w", err)
	}
	defer resp2.Body.Close()
	initBody, _ := io.ReadAll(resp2.Body)
	log.Printf("[BOT-CHANGYOU] Init page status: %d, body len: %d", resp2.StatusCode, len(initBody))

	baseU, _ := url.Parse(p.BaseURL)
	passportU, _ := url.Parse("https://passport.changyou.com")
	allCookies := append(jar.Cookies(baseU), jar.Cookies(passportU)...)

	if len(allCookies) == 0 {
		return nil, fmt.Errorf("登录后未获取到 Cookie，可能登录失败，响应: %s", truncate(loginHTML, 300))
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
	passportU, _ := url.Parse("https://passport.changyou.com")
	jar.SetCookies(passportU, session.Cookies)

	orderCount := 1
	pointValue := points

	bestPoint, bestCount := findBestPointCombo(points)
	if bestPoint > 0 {
		pointValue = bestPoint
		orderCount = bestCount
	}

	cardCount := pointValue / 20 // 每张卡20点，此字段为卡张数

	formData := url.Values{
		"cardOrders.gameType":  {"5073"},
		"cardOrders.chnl":      {"235"},
		"chnlType":             {"alipay"},
		"cardOrders.cardCount": {fmt.Sprintf("%d", cardCount)},
		"orderCount":           {fmt.Sprintf("%d", orderCount)},
	}

	confirmURL := fmt.Sprintf("%s/tl/confirmCardOrders.do", p.BaseURL)
	req, err := http.NewRequest("POST", confirmURL, strings.NewReader(formData.Encode()))
	if err != nil {
		return nil, fmt.Errorf("构建下单请求失败: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("User-Agent", session.UserAgent)
	req.Header.Set("Referer", fmt.Sprintf("%s/tl/tlBankInit.do?chnlType=alipay", p.BaseURL))
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
	req.Header.Set("Origin", p.BaseURL)

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("下单请求失败: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	html := string(body)

	log.Printf("[BOT-CHANGYOU] confirmCardOrders response: status=%d, body_len=%d, url=%s",
		resp.StatusCode, len(html), resp.Request.URL.String())
	log.Printf("[BOT-CHANGYOU] confirmCardOrders body preview: %s", truncate(html, 800))

	orderID := extractHiddenField(html, "cardOrders.id")
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
		return nil, fmt.Errorf("下单失败，未获取到订单ID，响应长度: %d，预览: %s", len(html), truncate(html, 500))
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
