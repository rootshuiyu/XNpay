package channel

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"xinipay/internal/model"
	"xinipay/pkg"
)

type AlipayChannel struct {
	Gateway    string
	AppID      string
	PrivateKey string
	PublicKey  string
	IsSandbox  bool
}

func init() {
	Register("alipay", &AlipayChannel{
		Gateway:   "https://openapi-sandbox.dl.alipaydev.com/gateway.do",
		IsSandbox: true,
	})
}

func (a *AlipayChannel) Name() string { return "支付宝" }

func (a *AlipayChannel) CreatePayment(order *model.PaymentOrder, notifyBaseURL string) (*PayResult, error) {
	account := order.Account
	if account == nil {
		return nil, fmt.Errorf("账号信息缺失")
	}

	appID := account.AppID
	if appID == "" {
		appID = a.AppID
	}

	bizContent := map[string]interface{}{
		"out_trade_no": order.OrderNo,
		"total_amount": fmt.Sprintf("%.2f", order.Amount),
		"subject":      order.Subject,
	}

	if order.PayMethod == "alipay_h5" {
		bizContent["product_code"] = "QUICK_WAP_WAY"
	} else {
		bizContent["product_code"] = "FACE_TO_FACE_PAYMENT"
	}

	bizJSON, _ := json.Marshal(bizContent)

	params := map[string]string{
		"app_id":      appID,
		"method":      "alipay.trade.precreate",
		"charset":     "utf-8",
		"sign_type":   "MD5",
		"timestamp":   time.Now().Format("2006-01-02 15:04:05"),
		"version":     "1.0",
		"notify_url":  notifyBaseURL + "/pay/callback/alipay",
		"biz_content": string(bizJSON),
	}

	if order.PayMethod == "alipay_h5" {
		params["method"] = "alipay.trade.wap.pay"
		params["return_url"] = order.ReturnURL
	}

	secret := account.AppSecret
	if secret == "" {
		secret = a.PrivateKey
	}
	params["sign"] = pkg.GenerateSign(params, secret)

	formData := url.Values{}
	for k, v := range params {
		formData.Set(k, v)
	}

	resp, err := http.PostForm(a.Gateway, formData)
	if err != nil {
		return &PayResult{
			QrCode:  fmt.Sprintf("%s/pay/mock/scan/%s", notifyBaseURL, order.OrderNo),
			PayURL:  fmt.Sprintf("%s/pay/mock/scan/%s", notifyBaseURL, order.OrderNo),
			TradeNo: fmt.Sprintf("ALI_FALLBACK_%d", time.Now().UnixMilli()),
			RawResp: fmt.Sprintf("sandbox_error: %v", err),
		}, nil
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var result map[string]interface{}
	json.Unmarshal(body, &result)

	qrCode := ""
	tradeNo := ""
	if preResp, ok := result["alipay_trade_precreate_response"].(map[string]interface{}); ok {
		if qr, ok := preResp["qr_code"].(string); ok {
			qrCode = qr
		}
		if tn, ok := preResp["trade_no"].(string); ok {
			tradeNo = tn
		}
	}

	if qrCode == "" {
		qrCode = fmt.Sprintf("%s/pay/mock/scan/%s", notifyBaseURL, order.OrderNo)
		tradeNo = fmt.Sprintf("ALI_FALLBACK_%d", time.Now().UnixMilli())
	}

	return &PayResult{
		QrCode:  qrCode,
		PayURL:  qrCode,
		TradeNo: tradeNo,
		RawResp: string(body),
	}, nil
}

func (a *AlipayChannel) QueryPayment(orderNo string) (*QueryResult, error) {
	return &QueryResult{Paid: false}, nil
}

func (a *AlipayChannel) ParseCallback(body []byte, params map[string]string) (*CallbackResult, error) {
	tradeStatus := params["trade_status"]
	paid := tradeStatus == "TRADE_SUCCESS" || tradeStatus == "TRADE_FINISHED"

	amount := 0.0
	if v, ok := params["total_amount"]; ok {
		fmt.Sscanf(v, "%f", &amount)
	}

	return &CallbackResult{
		OrderNo: params["out_trade_no"],
		TradeNo: params["trade_no"],
		Amount:  amount,
		Paid:    paid,
		RawData: strings.TrimSpace(string(body)),
	}, nil
}
