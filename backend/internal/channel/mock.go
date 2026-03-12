package channel

import (
	"fmt"
	"math/rand"
	"time"
	"xinipay/internal/model"
)

type MockChannel struct{}

func init() {
	Register("mock", &MockChannel{})
}

func (m *MockChannel) Name() string { return "模拟通道" }

func (m *MockChannel) CreatePayment(order *model.PaymentOrder, notifyBaseURL string) (*PayResult, error) {
	tradeNo := fmt.Sprintf("MOCK%d%d", time.Now().UnixMilli(), rand.Intn(9000)+1000)
	return &PayResult{
		QrCode:  fmt.Sprintf("%s/pay/mock/scan/%s", notifyBaseURL, order.OrderNo),
		PayURL:  fmt.Sprintf("%s/pay/mock/scan/%s", notifyBaseURL, order.OrderNo),
		TradeNo: tradeNo,
	}, nil
}

func (m *MockChannel) QueryPayment(orderNo string) (*QueryResult, error) {
	return &QueryResult{Paid: false}, nil
}

func (m *MockChannel) ParseCallback(body []byte, params map[string]string) (*CallbackResult, error) {
	orderNo := params["order_no"]
	return &CallbackResult{
		OrderNo: orderNo,
		TradeNo: fmt.Sprintf("MOCK_CB_%d", time.Now().UnixMilli()),
		Paid:    true,
	}, nil
}
