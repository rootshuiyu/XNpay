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

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("登录请求失败: %w", err)
	}
	defer resp.Body.Close()

	initURL := fmt.Sprintf("%s/tl/tlBankInit.do?chnlType=alipay", p.BaseURL)
	req2, _ := http.NewRequest("GET", initURL, nil)
	req2.Header.Set("User-Agent", ua)
	req2.Header.Set("Referer", p.BaseURL)

	resp2, err := client.Do(req2)
	if err != nil {
		return nil, fmt.Errorf("初始化充值页失败: %w", err)
	}
	defer resp2.Body.Close()
	io.ReadAll(resp2.Body)

	baseU, _ := url.Parse(p.BaseURL)
	passportU, _ := url.Parse("https://passport.changyou.com")
	allCookies := append(jar.Cookies(baseU), jar.Cookies(passportU)...)

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

	formData := url.Values{
		"cardOrders.gameType": {"5073"},
		"cardOrders.chnl":     {"235"},
		"chnlType":            {"alipay"},
		"cardOrders.cardCount": {fmt.Sprintf("%d", pointValue/20)},
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

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("下单请求失败: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	html := string(body)

	orderID := extractHiddenField(html, "cardOrders.id")
	spsn := extractHiddenField(html, "cardOrders.spsn")
	sign := extractHiddenField(html, "cardOrders.sign")
	cash := extractHiddenField(html, "cardOrders.cash")

	if orderID == "" {
		return nil, fmt.Errorf("下单失败，未获取到订单ID，响应: %s", truncate(html, 500))
	}

	gameOrder := &GameOrder{
		OrderID:  orderID,
		SerialNo: spsn,
		Amount:   amount,
		FormData: map[string]string{
			"cardOrders.id":        orderID,
			"cardOrders.spsn":      spsn,
			"cardOrders.sign":      sign,
			"cardOrders.cash":      cash,
			"cardOrders.chnl":      "235",
			"chnlType":             "alipay",
			"cardOrders.gameType":  "5073",
			"cardOrders.cardCount": fmt.Sprintf("%d", pointValue/20),
			"payWayChnlCode":       "235",
		},
	}

	log.Printf("[BOT-CHANGYOU] Order created: ID=%s, SN=%s, cash=%s", orderID, spsn, cash)
	return gameOrder, nil
}

func (p *ChangyouPlatform) GetQRCode(session *Session, gameOrder *GameOrder) (string, error) {
	jar, _ := cookiejar.New(nil)
	client := BuildHTTPClient(session.ProxyAddr, session.UserAgent)
	client.Jar = jar

	baseU, _ := url.Parse(p.BaseURL)
	jar.SetCookies(baseU, session.Cookies)

	qrURL := fmt.Sprintf("%s/new/getQr.do", p.BaseURL)
	req, err := http.NewRequest("GET", qrURL, nil)
	if err != nil {
		return "", fmt.Errorf("构建QR请求失败: %w", err)
	}
	req.Header.Set("User-Agent", session.UserAgent)
	req.Header.Set("Referer", p.BaseURL)

	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("获取QR码失败: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	html := string(body)

	qrImageURL := extractQRImageURL(html)
	if qrImageURL == "" {
		qrImageURL = extractIframeSrc(html)
	}

	if qrImageURL == "" {
		return "", fmt.Errorf("未找到二维码URL，响应: %s", truncate(html, 500))
	}

	if !strings.HasPrefix(qrImageURL, "http") {
		qrImageURL = p.BaseURL + qrImageURL
	}

	log.Printf("[BOT-CHANGYOU] QR code obtained: %s", qrImageURL)
	return qrImageURL, nil
}

func (p *ChangyouPlatform) CheckPayStatus(session *Session, gameOrder *GameOrder) (*PayStatus, error) {
	jar, _ := cookiejar.New(nil)
	client := BuildHTTPClient(session.ProxyAddr, session.UserAgent)
	client.Jar = jar

	baseU, _ := url.Parse(p.BaseURL)
	jar.SetCookies(baseU, session.Cookies)

	formData := url.Values{
		"chnlType":      {"alipay"},
		"gameType":      {"5073"},
		"payWayChnlCode": {gameOrder.FormData["payWayChnlCode"]},
	}
	if gameOrder.FormData["cardOrders.gameType"] != "" {
		formData.Set("cardOrders.gameType", gameOrder.FormData["cardOrders.gameType"])
	}
	if gameOrder.FormData["cardOrders.chnl"] != "" {
		formData.Set("cardOrders.chnl", gameOrder.FormData["cardOrders.chnl"])
	}
	if gameOrder.FormData["cardOrders.spsn"] != "" {
		formData.Set("cardOrders.spsn", gameOrder.FormData["cardOrders.spsn"])
	}

	checkURL := fmt.Sprintf("%s/tl/completePay.do", p.BaseURL)
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
	re := regexp.MustCompile(`<img[^>]+src="([^"]*)"[^>]*class="[^"]*qr[^"]*"`)
	match := re.FindStringSubmatch(html)
	if len(match) > 1 {
		return match[1]
	}
	re2 := regexp.MustCompile(`<img[^>]+class="[^"]*qr[^"]*"[^>]*src="([^"]*)"`)
	match2 := re2.FindStringSubmatch(html)
	if len(match2) > 1 {
		return match2[1]
	}
	re3 := regexp.MustCompile(`<img[^>]+src="(https?://[^"]*qr[^"]*)"`)
	match3 := re3.FindStringSubmatch(html)
	if len(match3) > 1 {
		return match3[1]
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
