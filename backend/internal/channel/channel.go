package channel

import "xinipay/internal/model"

type PayResult struct {
	QrCode   string // 二维码链接（PC扫码支付）
	PayURL   string // 支付跳转URL（H5跳转支付）
	TradeNo  string // 上游流水号
	RawResp  string // 原始响应（调试用）
}

type QueryResult struct {
	Paid    bool
	TradeNo string
	Amount  float64
}

type CallbackResult struct {
	OrderNo  string
	TradeNo  string
	Amount   float64
	Paid     bool
	RawData  string
}

type PayChannel interface {
	Name() string
	CreatePayment(order *model.PaymentOrder, notifyBaseURL string) (*PayResult, error)
	QueryPayment(orderNo string) (*QueryResult, error)
	ParseCallback(body []byte, params map[string]string) (*CallbackResult, error)
}

var Registry = map[string]PayChannel{}

func Register(code string, ch PayChannel) {
	Registry[code] = ch
}

func Get(code string) PayChannel {
	return Registry[code]
}
