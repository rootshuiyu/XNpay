package bot

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"regexp"
	"strings"
	"time"

	"xinipay/internal/model"
)

var gameNames = map[string]string{
	"5073": "天龙八部·归来",
	"5057": "怀旧天龙",
}

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

// Login 保留供管理端手动调试使用，正式下单不需要 session
func (p *ChangyouPlatform) Login(account *model.GameAccount, proxy string, ua string) (*Session, error) {
	jar, _ := cookiejar.New(nil)
	client := BuildHTTPClient(proxy, ua)
	client.Jar = jar
	client.CheckRedirect = nil

	loginPageURL := "https://auth.changyou.com/new_login.jsp?s=" + url.QueryEscape(p.BaseURL+"/")
	req1, _ := http.NewRequest("GET", loginPageURL, nil)
	req1.Header.Set("User-Agent", ua)
	req1.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")

	resp1, err := client.Do(req1)
	if err != nil {
		return nil, fmt.Errorf("获取登录页失败: %w", err)
	}
	defer resp1.Body.Close()
	loginPageHTML, _ := io.ReadAll(resp1.Body)

	loginToken := extractLoginToken(string(loginPageHTML))
	if loginToken == "" {
		return nil, fmt.Errorf("无法获取 loginToken")
	}

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

	req2, _ := http.NewRequest("POST", "https://auth.changyou.com/login", strings.NewReader(formData.Encode()))
	req2.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req2.Header.Set("User-Agent", ua)
	req2.Header.Set("Referer", "https://auth.changyou.com/loginpage")
	req2.Header.Set("Origin", "https://auth.changyou.com")

	resp2, err := client.Do(req2)
	if err != nil {
		return nil, fmt.Errorf("登录请求失败: %w", err)
	}
	defer resp2.Body.Close()
	loginBody, _ := io.ReadAll(resp2.Body)
	loginHTML := string(loginBody)

	if strings.Contains(loginHTML, "密码不正确") || strings.Contains(loginHTML, "账号不存在") ||
		strings.Contains(loginHTML, "new_login.jsp") {
		return nil, fmt.Errorf("账号密码错误: %s", truncate(loginHTML, 200))
	}

	if strings.Contains(loginHTML, "location.href") || strings.Contains(loginHTML, "window.location") {
		jsURL := extractJSRedirectURL(loginHTML)
		if jsURL != "" {
			reqJS, _ := http.NewRequest("GET", jsURL, nil)
			reqJS.Header.Set("User-Agent", ua)
			reqJS.Header.Set("Referer", "https://auth.changyou.com/login")
			client.Do(reqJS)
		}
	}

	baseU, _ := url.Parse(p.BaseURL)
	authU, _ := url.Parse("https://auth.changyou.com")
	allCookies := append(jar.Cookies(baseU), jar.Cookies(authU)...)

	if len(allCookies) == 0 {
		return nil, fmt.Errorf("登录后未获取到 Cookie")
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
	log.Printf("[BOT-CHANGYOU] 账号 %s 登录成功，cookies: %d", account.AccountName, len(allCookies))
	return session, nil
}

// CreateOrder 直接携带账号凭证向 confirmCardOrders.do 发起 POST，无需 session
// 参考 PHP 实现的 tradeOrder 方法
func (p *ChangyouPlatform) CreateOrder(account *model.GameAccount, amount float64, customerIP string) (*GameOrder, error) {
	// tradeNumber = fee * 20（点数）
	tradeNumber := int(amount * 20)
	if tradeNumber <= 0 {
		return nil, fmt.Errorf("金额 %.2f 无效", amount)
	}

	gameType := account.GameType
	if gameType == "" {
		gameType = "5073"
	}
	gameName, ok := gameNames[gameType]
	if !ok {
		gameName = "天龙八部·归来"
	}

	// alipay chnl=235, weixin chnl=221
	chnl := 235
	chnlType := "alipay"

	ua := "Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1"
	client := BuildHTTPClient(account.AppSecret, ua) // AppSecret 用于存储代理地址

	// 添加客户 IP 头，绕过 GeoIP 限制（参考 PHP 的 lsp_jl($order['ip'])）
	if customerIP == "" {
		customerIP = "125.87.68.100" // fallback 中国大陆 IP
	}

	formValues := url.Values{
		"cardOrders.gameType":              {gameType},
		"cardOrders.gameName":              {gameName},
		"gameType":                         {gameType},
		"chnl":                             {""},
		"cardOrders.cardCount":             {fmt.Sprintf("%d", tradeNumber)},
		"chnlType":                         {chnlType},
		"cardOrders.cardPwd":               {"0"},
		"currentDiscount.discountRule":     {fmt.Sprintf("%d", tradeNumber)},
		"userFrom":                         {"ingame"},
		"orderCountInfo":                   {",1"},
		"otherOpenWx":                      {""},
		"cardOrders.cn":                    {account.AccountName},
		"cardOrders.repeatcn":              {account.AccountName},
		fmt.Sprintf("point_%d", tradeNumber): {fmt.Sprintf("%d", tradeNumber)},
		"orderCount":                       {"1"},
		"cardOrders.chnl":                  {fmt.Sprintf("%d", chnl)},
		"costTime":                         {"17500"},
	}

	confirmURL := fmt.Sprintf("%s/tl/confirmCardOrders.do", p.BaseURL)
	req, err := http.NewRequest("POST", confirmURL, strings.NewReader(formValues.Encode()))
	if err != nil {
		return nil, fmt.Errorf("构建下单请求失败: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("User-Agent", ua)
	req.Header.Set("Referer", fmt.Sprintf("%s/tl/tlBankInit.do?chnlType=%s", p.BaseURL, chnlType))
	req.Header.Set("Origin", p.BaseURL)
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
	req.Header.Set("X-Forwarded-For", customerIP)
	req.Header.Set("X-Real-IP", customerIP)

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("confirmCardOrders 请求失败: %w", err)
	}
	defer resp.Body.Close()
	bodyBytes, _ := io.ReadAll(resp.Body)
	html := string(bodyBytes)

	log.Printf("[BOT-CHANGYOU] confirmCardOrders: status=%d, len=%d, url=%s",
		resp.StatusCode, len(html), resp.Request.URL.String())
	log.Printf("[BOT-CHANGYOU] confirmCardOrders [0-2000]: %s", truncate(html, 2000))
	if len(html) > 2000 {
		log.Printf("[BOT-CHANGYOU] confirmCardOrders [2000-end]: %s", truncate(html[2000:], 3000))
	}

	if strings.Contains(html, "非法用户") || strings.Contains(html, "login") || strings.Contains(html, "loginpage") {
		return nil, fmt.Errorf("账号认证失败或被拒绝: %s", truncate(html, 300))
	}

	// 提取表单字段（getForm）
	formFields := extractFormFields(html)
	log.Printf("[BOT-CHANGYOU] 提取表单字段: %+v", formFields)

	if len(formFields) == 0 {
		return nil, fmt.Errorf("下单失败，未提取到表单字段，响应: %s", truncate(html, 500))
	}

	spsn := formFields["cardOrders.spsn"]
	if spsn == "" {
		return nil, fmt.Errorf("下单失败，未获取 cardOrders.spsn，响应: %s", truncate(html, 500))
	}

	// costTime 固定写入
	formFields["costTime"] = "5150"

	gameOrder := &GameOrder{
		OrderID:  formFields["cardOrders.id"],
		SerialNo: spsn,
		Amount:   amount,
		FormData: formFields,
	}

	log.Printf("[BOT-CHANGYOU] 订单创建成功: spsn=%s, id=%s", spsn, gameOrder.OrderID)
	return gameOrder, nil
}

// GetQRCode 按照 PHP tradeAlipay 流程获取支付宝二维码内容
// 流程: addAlipayCardOrders.do → 获取URL → 访问URL跟随重定向 → POST到支付宝 → 提取 qrCode
func (p *ChangyouPlatform) GetQRCode(gameOrder *GameOrder) (string, error) {
	ua := "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
	proxy := ""
	client := BuildHTTPClient(proxy, ua)

	// Step 1: POST addAlipayCardOrders.do，获取支付宝中转 URL
	formValues := url.Values{}
	for k, v := range gameOrder.FormData {
		formValues.Set(k, v)
	}

	addURL := fmt.Sprintf("%s/tl/addAlipayCardOrders.do", p.BaseURL)
	req, err := http.NewRequest("POST", addURL, strings.NewReader(formValues.Encode()))
	if err != nil {
		return "", fmt.Errorf("构建 addAlipayCardOrders 请求失败: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("User-Agent", ua)
	req.Header.Set("Referer", p.BaseURL+"/")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")

	// 不自动跟随重定向，手动处理
	client.CheckRedirect = func(req *http.Request, via []*http.Request) error {
		return http.ErrUseLastResponse
	}

	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("addAlipayCardOrders 请求失败: %w", err)
	}
	defer resp.Body.Close()
	bodyBytes, _ := io.ReadAll(resp.Body)
	html := string(bodyBytes)

	log.Printf("[BOT-CHANGYOU] addAlipayCardOrders: status=%d, len=%d", resp.StatusCode, len(html))
	log.Printf("[BOT-CHANGYOU] addAlipayCardOrders body: %s", truncate(html, 1000))

	// Step 2: 从响应体中提取 var url = '...' 中转 URL（PHP geturl）
	midURL := extractJSVarURL(html)
	if midURL == "" {
		// 也可能是 302 重定向
		if resp.StatusCode == 302 || resp.StatusCode == 301 {
			midURL = resp.Header.Get("Location")
		}
	}
	if midURL == "" {
		return "", fmt.Errorf("获取支付链接失败1，响应: %s", truncate(html, 500))
	}

	log.Printf("[BOT-CHANGYOU] 获取中转 URL: %s", midURL)

	// Step 3: GET 中转 URL，得到含支付宝表单的页面（PHP getAlipayData）
	client2 := BuildHTTPClient(proxy, ua)
	client2.CheckRedirect = func(req *http.Request, via []*http.Request) error {
		return http.ErrUseLastResponse
	}

	req2, _ := http.NewRequest("GET", midURL, nil)
	req2.Header.Set("User-Agent", ua)
	req2.Header.Set("Referer", p.BaseURL+"/")

	resp2, err := client2.Do(req2)
	if err != nil {
		return "", fmt.Errorf("GET 中转 URL 失败: %w", err)
	}
	defer resp2.Body.Close()
	body2, _ := io.ReadAll(resp2.Body)
	html2 := string(body2)

	log.Printf("[BOT-CHANGYOU] 中转URL响应: status=%d, len=%d", resp2.StatusCode, len(html2))
	log.Printf("[BOT-CHANGYOU] 中转URL body: %s", truncate(html2, 1000))

	// Step 4: 提取支付宝表单 action 和 biz_content
	alipayAction, bizContent := extractAlipayFormData(html2)
	if alipayAction == "" {
		return "", fmt.Errorf("获取支付链接失败2，无法提取支付宝 form action，body: %s", truncate(html2, 500))
	}

	log.Printf("[BOT-CHANGYOU] 支付宝 action: %s, biz_content len: %d", alipayAction, len(bizContent))

	// Step 5: POST 到支付宝，获取最终 QR 码（PHP getRedirectUrl → getQrcode）
	qrCode, err := p.postAlipayAndGetQR(alipayAction, bizContent, midURL, ua)
	if err != nil {
		return "", fmt.Errorf("获取支付宝 QR 失败: %w", err)
	}

	if qrCode == "" {
		return "", fmt.Errorf("提取 QR 码内容为空")
	}

	log.Printf("[BOT-CHANGYOU] 获取 qrCode 成功: %s", truncate(qrCode, 100))

	qrImageURL := buildQRImageURL(qrCode)

	// 构造 render.alipay.com 桥接 URL：用支付宝官方桥接页包装原始 QR 码链接
	// 移动端跳转此 URL 后，桥接页会通过 Universal Links / Intent URL 唤起支付宝 App
	// 支付宝 App 内 saId=10000007（扫一扫）处理 qrcode 参数，弹出付款页
	scheme := "alipays://platformapi/startapp?saId=10000007&qrcode=" + url.QueryEscape(qrCode)
	bridgeURL := "https://render.alipay.com/p/s/i/?scheme=" + url.QueryEscape(scheme)

	return qrImageURL + "|||" + bridgeURL, nil
}

// postAlipayAndGetQR 执行 PHP getRedirectUrl 逻辑：
// POST 到 openapi.alipay.com → 跟随两次重定向 → 提取 qrCode
func (p *ChangyouPlatform) postAlipayAndGetQR(action, bizContent, referer, ua string) (string, error) {
	body := "biz_content=" + url.QueryEscape(bizContent)

	// 第一次 POST 到支付宝
	client1 := &http.Client{
		Timeout: 30 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}

	req1, _ := http.NewRequest("POST", action, strings.NewReader(body))
	req1.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req1.Header.Set("User-Agent", ua)
	req1.Header.Set("Referer", referer)
	req1.Header.Set("Origin", "https://peak.changyou.com")
	req1.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8")

	resp1, err := client1.Do(req1)
	if err != nil {
		return "", fmt.Errorf("POST 到支付宝失败: %w", err)
	}
	defer resp1.Body.Close()
	body1Bytes, _ := io.ReadAll(resp1.Body)
	html1 := string(body1Bytes)

	log.Printf("[BOT-CHANGYOU] 支付宝 POST 1: status=%d, len=%d", resp1.StatusCode, len(html1))
	log.Printf("[BOT-CHANGYOU] 支付宝 POST 1 body: %s", truncate(html1, 500))

	// 收集第一次重定向 URL 和 Cookie
	redirectURL1 := resp1.Header.Get("Location")
	cookie1 := collectCookies(resp1.Header)

	if redirectURL1 == "" {
		// 可能直接在响应体里包含 qrCode
		qr := extractQRCodeValue(html1)
		if qr != "" {
			return qr, nil
		}
		return "", fmt.Errorf("支付宝未返回重定向地址，body: %s", truncate(html1, 300))
	}

	log.Printf("[BOT-CHANGYOU] 支付宝重定向1: %s", redirectURL1)

	// 第二次 GET 跟随重定向
	client2 := &http.Client{
		Timeout: 30 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}

	req2, _ := http.NewRequest("GET", redirectURL1, nil)
	req2.Header.Set("User-Agent", ua)
	req2.Header.Set("Referer", action)
	req2.Header.Set("Cookie", cookie1)

	resp2, err := client2.Do(req2)
	if err != nil {
		return "", fmt.Errorf("GET 重定向1 失败: %w", err)
	}
	defer resp2.Body.Close()
	body2Bytes, _ := io.ReadAll(resp2.Body)
	html2 := string(body2Bytes)

	log.Printf("[BOT-CHANGYOU] 支付宝重定向1 响应: status=%d, len=%d", resp2.StatusCode, len(html2))

	// 收集第二次重定向 URL 和 Cookie
	redirectURL2 := resp2.Header.Get("Location")
	cookie2 := cookie1 + "; " + collectCookies(resp2.Header)

	// 检查是否直接包含 qrCode
	qr := extractQRCodeValue(html2)
	if qr != "" {
		return qr, nil
	}

	if redirectURL2 == "" {
		return extractQRCodeValue(html2), nil
	}

	log.Printf("[BOT-CHANGYOU] 支付宝重定向2: %s", redirectURL2)

	// 第三次 GET 获取最终页面
	client3 := &http.Client{
		Timeout: 30 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}

	req3, _ := http.NewRequest("GET", redirectURL2, nil)
	req3.Header.Set("User-Agent", ua)
	req3.Header.Set("Referer", redirectURL1)
	req3.Header.Set("Cookie", cookie2)

	resp3, err := client3.Do(req3)
	if err != nil {
		return "", fmt.Errorf("GET 重定向2 失败: %w", err)
	}
	defer resp3.Body.Close()
	body3Bytes, _ := io.ReadAll(resp3.Body)
	html3 := string(body3Bytes)

	log.Printf("[BOT-CHANGYOU] 最终页面: status=%d, len=%d", resp3.StatusCode, len(html3))
	log.Printf("[BOT-CHANGYOU] 最终页面 body: %s", truncate(html3, 1000))

	return extractQRCodeValue(html3), nil
}

// CheckPayStatus 查询订单是否支付成功（对应 PHP queryOrder）
func (p *ChangyouPlatform) CheckPayStatus(account *model.GameAccount, gameOrder *GameOrder) (*PayStatus, error) {
	gameType := account.GameType
	if gameType == "" {
		gameType = "5073"
	}
	if gameOrder.FormData != nil {
		if gt := gameOrder.FormData["cardOrders.gameType"]; gt != "" {
			gameType = gt
		}
	}

	spsn := gameOrder.SerialNo
	if spsn == "" && gameOrder.FormData != nil {
		spsn = gameOrder.FormData["cardOrders.spsn"]
	}
	if spsn == "" {
		return &PayStatus{Paid: false}, nil
	}

	ua := "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
	client := BuildHTTPClient(account.AppSecret, ua)

	checkURL := fmt.Sprintf("%s/tl/completePay.do?gameType=%s&cardOrders.gameType=%s&cardOrders.chnl=236&cardOrders.spsn=%s&payWayChnlCode=235",
		p.BaseURL, gameType, gameType, spsn)

	formBody := url.Values{
		"chnlType": {"alipay"},
		"costTime": {"0"},
	}

	req, _ := http.NewRequest("POST", checkURL, strings.NewReader(formBody.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded;charset=UTF-8")
	req.Header.Set("User-Agent", ua)
	req.Header.Set("Origin", p.BaseURL)
	req.Header.Set("Referer", fmt.Sprintf("%s/tl/confirmCardOrders.do", p.BaseURL))

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("状态查询失败: %w", err)
	}
	defer resp.Body.Close()
	bodyBytes, _ := io.ReadAll(resp.Body)
	html := string(bodyBytes)

	paid := strings.Contains(html, "恭喜您，充值成功！") ||
		strings.Contains(html, "充值成功") ||
		strings.Contains(html, "支付成功")

	log.Printf("[BOT-CHANGYOU] completePay spsn=%s: paid=%v, preview=%s",
		spsn, paid, truncate(html, 200))

	return &PayStatus{Paid: paid, Amount: gameOrder.Amount}, nil
}

// ---- 辅助函数 ----

// extractFormFields 提取 HTML 中第一个 form 表单内所有 input 的 name/value（对应 PHP getForm）
func extractFormFields(html string) map[string]string {
	result := make(map[string]string)

	// 找到第一个 form 标签内容
	reForm := regexp.MustCompile(`(?is)<form\b[^>]*>(.*?)</form>`)
	formMatch := reForm.FindStringSubmatch(html)
	if len(formMatch) < 2 {
		return result
	}
	formContent := formMatch[1]

	// 提取所有 input 的 name 和 value
	reInput := regexp.MustCompile(`(?is)<input\b([^>]*)>`)
	inputs := reInput.FindAllStringSubmatch(formContent, -1)
	for _, inp := range inputs {
		attrs := inp[1]
		name := extractAttr(attrs, "name")
		value := extractAttr(attrs, "value")
		if name != "" {
			result[name] = value
		}
	}
	return result
}

// extractAttr 从 HTML 属性字符串中提取指定属性值
func extractAttr(attrs, attrName string) string {
	re := regexp.MustCompile(`(?i)\b` + regexp.QuoteMeta(attrName) + `\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]*))`)
	m := re.FindStringSubmatch(attrs)
	if len(m) > 1 {
		if m[1] != "" {
			return m[1]
		}
		if m[2] != "" {
			return m[2]
		}
		return m[3]
	}
	return ""
}

// extractJSVarURL 从 JS 代码提取 var url = '...' 中的 URL（对应 PHP geturl）
func extractJSVarURL(html string) string {
	re := regexp.MustCompile(`var\s+url\s*=\s*["']([^"']+)["']`)
	m := re.FindStringSubmatch(html)
	if len(m) > 1 {
		return m[1]
	}
	return ""
}

// extractAlipayFormData 从支付宝跳转页中提取 action 和 biz_content（对应 PHP getAlipayData）
func extractAlipayFormData(html string) (action, bizContent string) {
	reForm := regexp.MustCompile(`(?is)<form\b[^>]*\baction\s*=\s*["']([^"']+)["'][^>]*>(.*?)</form>`)
	formMatch := reForm.FindStringSubmatch(html)
	if len(formMatch) < 3 {
		return "", ""
	}
	action = formMatch[1]
	formContent := formMatch[2]

	// 提取 biz_content input 的 value
	reBiz := regexp.MustCompile(`(?is)<input\b[^>]*\bname\s*=\s*["']biz_content["'][^>]*\bvalue\s*=\s*["']([^"']*)["']`)
	bm := reBiz.FindStringSubmatch(formContent)
	if len(bm) > 1 {
		bizContent = bm[1]
	}
	// 尝试 value 在 name 之前的情况
	if bizContent == "" {
		reBiz2 := regexp.MustCompile(`(?is)<input\b[^>]*\bvalue\s*=\s*["']([^"']*)["'][^>]*\bname\s*=\s*["']biz_content["']`)
		bm2 := reBiz2.FindStringSubmatch(formContent)
		if len(bm2) > 1 {
			bizContent = bm2[1]
		}
	}

	// HTML 实体解码
	bizContent = htmlEntityDecode(bizContent)
	return action, bizContent
}

// extractQRCodeValue 从最终页面提取 input[name=qrCode] 的 value（对应 PHP getQrcode）
func extractQRCodeValue(html string) string {
	re := regexp.MustCompile(`(?i)<input\b[^>]*\bname\s*=\s*["']?qrCode["']?[^>]*\bvalue\s*=\s*["']?([^"'\s>]+)["']?`)
	m := re.FindStringSubmatch(html)
	if len(m) > 1 {
		return m[1]
	}
	// 反序匹配
	re2 := regexp.MustCompile(`(?i)<input\b[^>]*\bvalue\s*=\s*["']?([^"'\s>]+)["']?[^>]*\bname\s*=\s*["']?qrCode["']?`)
	m2 := re2.FindStringSubmatch(html)
	if len(m2) > 1 {
		return m2[1]
	}
	return ""
}

// collectCookies 从响应头收集 Set-Cookie 拼接成 Cookie 字符串
func collectCookies(header http.Header) string {
	var parts []string
	for _, v := range header["Set-Cookie"] {
		// 只取 name=value 部分（第一段）
		parts = append(parts, strings.Split(v, ";")[0])
	}
	return strings.Join(parts, "; ")
}

// buildQRImageURL 将 qrCode 内容（字符串）通过第三方 API 生成二维码图片 URL
func buildQRImageURL(content string) string {
	encoded := url.QueryEscape(content)
	return fmt.Sprintf("https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=%s", encoded)
}

// htmlEntityDecode 简单替换常见 HTML 实体
func htmlEntityDecode(s string) string {
	replacer := strings.NewReplacer(
		"&amp;", "&",
		"&lt;", "<",
		"&gt;", ">",
		"&quot;", `"`,
		"&#39;", "'",
		"&nbsp;", " ",
	)
	return replacer.Replace(s)
}

// extractJSRedirectURL 从 JS 代码提取 location.href 的 URL
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
	re2 := regexp.MustCompile(`value="(LT-[^"]+)"`)
	m2 := re2.FindStringSubmatch(html)
	if len(m2) > 1 {
		return m2[1]
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
			Name:  c.Name,
			Value: c.Value,
		})
	}
	b, _ := json.Marshal(changyouSessionCookies{Cookies: data})
	return string(b)
}
