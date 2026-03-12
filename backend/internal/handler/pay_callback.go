package handler

import (
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"xinipay/internal/channel"
	"xinipay/internal/model"
	"xinipay/internal/service"
	"xinipay/pkg"

	"github.com/gin-gonic/gin"
)

func AlipayCallback(c *gin.Context) {
	body, _ := io.ReadAll(c.Request.Body)
	params := pkg.FormToMap(c.Request.PostForm)
	if len(params) == 0 {
		c.Request.ParseForm()
		params = pkg.FormToMap(c.Request.Form)
	}

	ch := channel.Get("alipay")
	result, err := ch.ParseCallback(body, params)
	if err != nil {
		c.String(http.StatusOK, "fail")
		return
	}

	if !result.Paid {
		c.String(http.StatusOK, "success")
		return
	}

	processPaymentSuccess(result)
	c.String(http.StatusOK, "success")
}

func WechatCallback(c *gin.Context) {
	body, _ := io.ReadAll(c.Request.Body)

	ch := channel.Get("wechat")
	result, err := ch.ParseCallback(body, nil)
	if err != nil {
		c.String(http.StatusOK, "<xml><return_code>FAIL</return_code></xml>")
		return
	}

	if !result.Paid {
		c.String(http.StatusOK, "<xml><return_code>SUCCESS</return_code></xml>")
		return
	}

	processPaymentSuccess(result)
	c.String(http.StatusOK, "<xml><return_code>SUCCESS</return_code><return_msg>OK</return_msg></xml>")
}

func processPaymentSuccess(result *channel.CallbackResult) {
	var order model.PaymentOrder
	if err := model.DB.Preload("Channel").
		Where("order_no = ? AND status = 'pending'", result.OrderNo).
		First(&order).Error; err != nil {
		return
	}

	now := time.Now()
	actualAmount := order.Amount
	if order.Channel != nil && order.Channel.FeeRate > 0 {
		actualAmount = order.Amount * (1 - order.Channel.FeeRate)
	}

	model.DB.Model(&order).Updates(map[string]interface{}{
		"status":           "paid",
		"actual_amount":    actualAmount,
		"channel_trade_no": result.TradeNo,
		"paid_at":          &now,
	})

	if order.AccountID > 0 {
		service.ConsumeAccount(order.AccountID)
	}

	distributeCommission(order)

	go NotifyMerchant(order.ID)

	broadcastNewOrder(order.OrderNo, order.Amount)
}

func distributeCommission(order model.PaymentOrder) {
	if order.MerchantID == 0 {
		return
	}

	var merchant model.Merchant
	if err := model.DB.First(&merchant, order.MerchantID).Error; err != nil {
		return
	}

	// 沿 path 逐级分佣
	pathParts := strings.Split(merchant.Path, "/")
	if len(pathParts) == 0 {
		return
	}

	// 收集路径上所有商户，从根到当前
	var merchantIDs []string
	for _, p := range pathParts {
		if p != "" {
			merchantIDs = append(merchantIDs, p)
		}
	}

	var pathMerchants []model.Merchant
	model.DB.Where("id IN ?", merchantIDs).Order("level ASC").Find(&pathMerchants)

	// 逐级分佣：每个商户的利润 = 订单金额 * (该商户被设定的费率 - 上一级被设定的费率)
	prevRate := 0.0
	for _, m := range pathMerchants {
		profit := order.Amount * (m.FeeRate - prevRate)
		if profit > 0 {
			model.DB.Model(&m).Update("balance", m.Balance+profit)
			commission := model.CommissionRecord{
				OrderID:          order.ID,
				AdminID:          m.ID,
				CommissionRate:   m.FeeRate - prevRate,
				CommissionAmount: profit,
				Remark:           fmt.Sprintf("分级佣金 L%d", m.Level),
			}
			model.DB.Create(&commission)
		}
		prevRate = m.FeeRate
	}
}

func NotifyMerchant(orderID uint) {
	var order model.PaymentOrder
	if err := model.DB.First(&order, orderID).Error; err != nil {
		return
	}

	if order.NotifyURL == "" {
		model.DB.Model(&order).Update("notify_status", "success")
		return
	}

	var account model.GameAccount
	model.DB.First(&account, order.AccountID)

	params := map[string]string{
		"order_no":       order.OrderNo,
		"out_trade_no":   order.OutTradeNo,
		"amount":         fmt.Sprintf("%.2f", order.Amount),
		"actual_amount":  fmt.Sprintf("%.2f", order.ActualAmount),
		"status":         order.Status,
		"paid_at":        "",
	}
	if order.PaidAt != nil {
		params["paid_at"] = order.PaidAt.Format("2006-01-02 15:04:05")
	}
	params["sign"] = pkg.GenerateSign(params, account.AppSecret)

	maxRetry := 3
	for i := 0; i < maxRetry; i++ {
		model.DB.Model(&order).Update("notify_count", i+1)

		resp, err := http.PostForm(order.NotifyURL, mapToValues(params))
		if err != nil {
			time.Sleep(time.Duration(i+1) * 5 * time.Second)
			continue
		}

		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		if string(body) == "success" || resp.StatusCode == 200 {
			model.DB.Model(&order).Update("notify_status", "success")
			return
		}

		time.Sleep(time.Duration(i+1) * 5 * time.Second)
	}

	model.DB.Model(&order).Update("notify_status", "failed")
}

func mapToValues(m map[string]string) map[string][]string {
	v := make(map[string][]string, len(m))
	for k, val := range m {
		v[k] = []string{val}
	}
	return v
}
