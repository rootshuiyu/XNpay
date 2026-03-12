package channel

import (
	"encoding/json"
	"encoding/xml"
	"fmt"
	"time"

	"xinipay/internal/model"
	"xinipay/pkg"
)

type WechatChannel struct {
	IsSandbox bool
}

func init() {
	Register("wechat", &WechatChannel{IsSandbox: true})
}

func (w *WechatChannel) Name() string { return "微信支付" }

type WxUnifiedOrderReq struct {
	XMLName        xml.Name `xml:"xml"`
	AppID          string   `xml:"appid"`
	MchID          string   `xml:"mch_id"`
	NonceStr       string   `xml:"nonce_str"`
	Sign           string   `xml:"sign"`
	Body           string   `xml:"body"`
	OutTradeNo     string   `xml:"out_trade_no"`
	TotalFee       int      `xml:"total_fee"`
	SpbillCreateIP string   `xml:"spbill_create_ip"`
	NotifyURL      string   `xml:"notify_url"`
	TradeType      string   `xml:"trade_type"`
}

func (w *WechatChannel) CreatePayment(order *model.PaymentOrder, notifyBaseURL string) (*PayResult, error) {
	account := order.Account
	if account == nil {
		return nil, fmt.Errorf("账号信息缺失")
	}

	nonceStr := fmt.Sprintf("%d", time.Now().UnixNano())
	totalFee := int(order.Amount * 100)

	tradeType := "NATIVE"
	if order.PayMethod == "wechat_h5" {
		tradeType = "MWEB"
	}

	params := map[string]string{
		"appid":            account.AppID,
		"mch_id":           account.AccountName,
		"nonce_str":        nonceStr,
		"body":             order.Subject,
		"out_trade_no":     order.OrderNo,
		"total_fee":        fmt.Sprintf("%d", totalFee),
		"spbill_create_ip": "127.0.0.1",
		"notify_url":       notifyBaseURL + "/pay/callback/wechat",
		"trade_type":       tradeType,
	}

	sign := pkg.GenerateSign(params, account.AppSecret)
	_ = sign

	mockQrCode := fmt.Sprintf("%s/pay/mock/scan/%s", notifyBaseURL, order.OrderNo)
	tradeNo := fmt.Sprintf("WX_%d", time.Now().UnixMilli())

	return &PayResult{
		QrCode:  mockQrCode,
		PayURL:  mockQrCode,
		TradeNo: tradeNo,
		RawResp: fmt.Sprintf("sandbox_mode: trade_type=%s, total_fee=%d", tradeType, totalFee),
	}, nil
}

func (w *WechatChannel) QueryPayment(orderNo string) (*QueryResult, error) {
	return &QueryResult{Paid: false}, nil
}

type WxCallbackData struct {
	XMLName    xml.Name `xml:"xml"`
	ReturnCode string   `xml:"return_code"`
	ResultCode string   `xml:"result_code"`
	OutTradeNo string   `xml:"out_trade_no"`
	TradeNo    string   `xml:"transaction_id"`
	TotalFee   int      `xml:"total_fee"`
}

func (w *WechatChannel) ParseCallback(body []byte, params map[string]string) (*CallbackResult, error) {
	var data WxCallbackData
	if err := xml.Unmarshal(body, &data); err != nil {
		var jsonData map[string]interface{}
		if jsonErr := json.Unmarshal(body, &jsonData); jsonErr == nil {
			orderNo, _ := jsonData["order_no"].(string)
			return &CallbackResult{
				OrderNo: orderNo,
				TradeNo: fmt.Sprintf("WX_CB_%d", time.Now().UnixMilli()),
				Paid:    true,
			}, nil
		}
		return nil, fmt.Errorf("解析回调数据失败: %v", err)
	}

	paid := data.ReturnCode == "SUCCESS" && data.ResultCode == "SUCCESS"
	return &CallbackResult{
		OrderNo: data.OutTradeNo,
		TradeNo: data.TradeNo,
		Amount:  float64(data.TotalFee) / 100,
		Paid:    paid,
		RawData: string(body),
	}, nil
}
