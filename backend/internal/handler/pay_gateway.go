package handler

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"xinipay/internal/bot"
	"xinipay/internal/channel"
	"xinipay/internal/model"
	"xinipay/internal/service"
	"xinipay/pkg"

	"github.com/gin-gonic/gin"
)

type CreateOrderRequest struct {
	ChannelCode string `json:"channel_code" form:"channel_code" binding:"required"`
	OutTradeNo  string `json:"out_trade_no" form:"out_trade_no" binding:"required"`
	Amount      string `json:"amount" form:"amount" binding:"required"`
	NotifyURL   string `json:"notify_url" form:"notify_url" binding:"required"`
	ReturnURL   string `json:"return_url" form:"return_url"`
	Subject     string `json:"subject" form:"subject"`
	AppID       string `json:"app_id" form:"app_id"`
	Timestamp   string `json:"timestamp" form:"timestamp"`
	Sign        string `json:"sign" form:"sign" binding:"required"`
}

func PayCreateOrder(c *gin.Context) {
	var req CreateOrderRequest
	if err := c.ShouldBind(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 400, "message": "参数错误: " + err.Error()})
		return
	}

	var gameChannel model.GameChannel
	if err := model.DB.Where("channel_code = ?", req.ChannelCode).
		First(&gameChannel).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 401, "message": "无效的channel_code"})
		return
	}
	if gameChannel.Status == 0 {
		c.JSON(http.StatusOK, gin.H{"code": 401, "message": "通道已停用"})
		return
	}
	if gameChannel.Status == 2 {
		notice := gameChannel.MaintenanceNote
		if notice == "" {
			notice = model.GetConfigValue(model.ConfigMaintenanceNotice, "当前通道维护中，请稍后再试")
		}
		c.JSON(http.StatusOK, gin.H{"code": 400, "message": notice})
		return
	}

	secret := gameChannel.ConfigJSON
	if secret == "" {
		secret = "default_secret"
	}

	params := map[string]string{
		"channel_code": req.ChannelCode,
		"out_trade_no": req.OutTradeNo,
		"amount":       req.Amount,
		"notify_url":   req.NotifyURL,
		"return_url":   req.ReturnURL,
		"subject":      req.Subject,
		"app_id":       req.AppID,
		"timestamp":    req.Timestamp,
		"sign":         req.Sign,
	}

	if !pkg.VerifySign(params, secret) {
		c.JSON(http.StatusOK, gin.H{"code": 401, "message": "签名验证失败"})
		return
	}

	var amount float64
	fmt.Sscanf(req.Amount, "%f", &amount)
	if amount <= 0 {
		c.JSON(http.StatusOK, gin.H{"code": 400, "message": "金额必须大于0"})
		return
	}

	if gameChannel.MinAmount > 0 && amount < gameChannel.MinAmount {
		c.JSON(http.StatusOK, gin.H{"code": 400, "message": fmt.Sprintf("金额不能小于%.2f", gameChannel.MinAmount)})
		return
	}
	if gameChannel.MaxAmount > 0 && amount > gameChannel.MaxAmount {
		c.JSON(http.StatusOK, gin.H{"code": 400, "message": fmt.Sprintf("金额不能大于%.2f", gameChannel.MaxAmount)})
		return
	}

	var existing model.PaymentOrder
	if err := model.DB.Where("out_trade_no = ? AND channel_id = ?", req.OutTradeNo, gameChannel.ID).
		First(&existing).Error; err == nil {
		cashierURL := fmt.Sprintf("/cashier/%s", existing.OrderNo)
		c.JSON(http.StatusOK, gin.H{
			"code":    0,
			"message": "success",
			"data": gin.H{
				"order_no":    existing.OrderNo,
				"cashier_url": cashierURL,
				"amount":      existing.Amount,
				"status":      existing.Status,
				"expire_at":   existing.ExpireAt,
			},
		})
		return
	}

	orderNo := pkg.GenerateOrderNo()
	subject := req.Subject
	if subject == "" {
		subject = gameChannel.Name + " - 充值"
	}

	// 先分配账号，避免 account_id=0 违反外键约束
	assigned, err := service.AssignAccount(gameChannel.ID, 0)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 500, "message": "暂无可用账号，请稍后重试"})
		return
	}

	clientIP := c.GetHeader("X-Forwarded-For")
	if clientIP == "" {
		clientIP = c.GetHeader("X-Real-IP")
	}
	if clientIP == "" {
		clientIP = c.ClientIP()
	}
	// 只取第一个 IP（X-Forwarded-For 可能含多个）
	if idx := strings.Index(clientIP, ","); idx != -1 {
		clientIP = strings.TrimSpace(clientIP[:idx])
	}

	order := model.PaymentOrder{
		MerchantID:   gameChannel.MerchantID,
		OrderNo:      orderNo,
		OutTradeNo:   req.OutTradeNo,
		ChannelID:    gameChannel.ID,
		AccountID:    assigned.ID,
		Amount:       amount,
		Subject:      subject,
		Status:       "pending",
		NotifyURL:    req.NotifyURL,
		ReturnURL:    req.ReturnURL,
		NotifyStatus: "pending",
		ClientIP:     clientIP,
		ExpireAt:     func() *time.Time { t := time.Now().Add(getOrderTimeoutDuration()); return &t }(),
	}

	if err := model.DB.Create(&order).Error; err != nil {
		service.ReleaseAccount(assigned.ID)
		c.JSON(http.StatusOK, gin.H{"code": 500, "message": "创建订单失败: " + err.Error()})
		return
	}

	// 更新账号绑定的真实订单ID
	model.DB.Model(&assigned).Update("order_id", order.ID)

	if bot.Bot.IsRunning() {
		model.DB.Model(&order).Update("bot_status", bot.BotStatusQueued)
	}

	cashierURL := fmt.Sprintf("/cashier/%s", orderNo)
	c.JSON(http.StatusOK, gin.H{
		"code":    0,
		"message": "success",
		"data": gin.H{
			"order_no":    orderNo,
			"cashier_url": cashierURL,
			"amount":      amount,
			"status":      "pending",
			"expire_at":   order.ExpireAt,
		},
	})
}

func PayQueryOrder(c *gin.Context) {
	appID := c.Query("app_id")
	outTradeNo := c.Query("out_trade_no")
	orderNo := c.Query("order_no")
	sign := c.Query("sign")

	if appID == "" || sign == "" {
		c.JSON(http.StatusOK, gin.H{"code": 400, "message": "缺少必要参数"})
		return
	}

	var account model.GameAccount
	if err := model.DB.Where("app_id = ? AND status = 1", appID).First(&account).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 401, "message": "无效的app_id"})
		return
	}

	params := pkg.FormToMap(c.Request.URL.Query())
	if !pkg.VerifySign(params, account.AppSecret) {
		c.JSON(http.StatusOK, gin.H{"code": 401, "message": "签名验证失败"})
		return
	}

	var order model.PaymentOrder
	query := model.DB.Where("account_id = ?", account.ID)
	if orderNo != "" {
		query = query.Where("order_no = ?", orderNo)
	} else if outTradeNo != "" {
		query = query.Where("out_trade_no = ?", outTradeNo)
	} else {
		c.JSON(http.StatusOK, gin.H{"code": 400, "message": "请提供order_no或out_trade_no"})
		return
	}

	if err := query.First(&order).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 404, "message": "订单不存在"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    0,
		"message": "success",
		"data": gin.H{
			"order_no":       order.OrderNo,
			"out_trade_no":   order.OutTradeNo,
			"amount":         order.Amount,
			"actual_amount":  order.ActualAmount,
			"status":         order.Status,
			"paid_at":        order.PaidAt,
			"channel_trade_no": order.ChannelTradeNo,
			"notify_status":  order.NotifyStatus,
			"notify_count":   order.NotifyCount,
			"expire_at":      order.ExpireAt,
		},
	})
}

type CashierInitRequest struct {
	PayMethod string `json:"pay_method" binding:"required"`
}

func CashierGetOrder(c *gin.Context) {
	orderNo := c.Param("order_no")
	var order model.PaymentOrder
	if err := model.DB.Preload("Channel").Preload("Account").
		Where("order_no = ?", orderNo).First(&order).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 404, "message": "订单不存在"})
		return
	}

	channelName := ""
	gameIcon := ""
	if order.Channel != nil {
		channelName = order.Channel.Name
		gameIcon = order.Channel.GameIcon
	}

	accountInfo := gin.H{}
	if order.Account != nil {
		accountInfo = gin.H{
			"account_name": order.Account.AccountName,
			"password":     order.Account.Password,
			"game_name":    order.Account.GameName,
			"login_info":   order.Account.LoginInfo,
		}
	}

	qrProxyURL := ""
	if order.QrCode != "" {
		qrProxyURL = fmt.Sprintf("/pay/qr/%s", order.OrderNo)
	}

	c.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": gin.H{
			"order_no":     order.OrderNo,
			"amount":       order.Amount,
			"subject":      order.Subject,
			"status":       order.Status,
			"return_url":   order.ReturnURL,
			"channel":      channelName,
			"game_icon":    gameIcon,
			"account_info": accountInfo,
			"created_at":   order.CreatedAt,
			"expire_at":    order.ExpireAt,
			"notify_status": order.NotifyStatus,
			"qr_code":      qrProxyURL,
			"pay_url":      order.PayURL,
			"bot_status":   order.BotStatus,
			"pay_method":   order.PayMethod,
		},
	})
}

func CashierInitPay(c *gin.Context) {
	orderNo := c.Param("order_no")
	var req CashierInitRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 400, "message": "请选择支付方式"})
		return
	}

	var order model.PaymentOrder
	if err := model.DB.Preload("Channel").Preload("Account").
		Where("order_no = ? AND status = 'pending'", orderNo).First(&order).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 400, "message": "订单不存在或已支付"})
		return
	}

	if req.PayMethod == "game_account" {
		model.DB.Model(&order).Update("pay_method", "game_account")
		c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"pay_method": "game_account"}})
		return
	}

	channelCode := "mock"
	if order.Channel != nil {
		switch order.Channel.PaymentType {
		case "alipay":
			channelCode = "alipay"
		case "wechat":
			channelCode = "wechat"
		}
	}

	if req.PayMethod == "alipay" || req.PayMethod == "alipay_h5" {
		channelCode = "alipay"
	} else if req.PayMethod == "wechat" || req.PayMethod == "wechat_h5" {
		channelCode = "wechat"
	}

	ch := channel.Get(channelCode)
	if ch == nil {
		ch = channel.Get("mock")
	}

	order.PayMethod = req.PayMethod
	scheme := "http"
	host := c.Request.Host
	notifyBase := fmt.Sprintf("%s://%s", scheme, host)

	result, err := ch.CreatePayment(&order, notifyBase)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 500, "message": "创建支付失败: " + err.Error()})
		return
	}

	model.DB.Model(&order).Updates(map[string]interface{}{
		"pay_method":       req.PayMethod,
		"qr_code":          result.QrCode,
		"pay_url":          result.PayURL,
		"channel_trade_no": result.TradeNo,
	})

	c.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": gin.H{
			"qr_code":   result.QrCode,
			"pay_url":   result.PayURL,
			"trade_no":  result.TradeNo,
		},
	})
}

func CashierConfirmPay(c *gin.Context) {
	orderNo := c.Param("order_no")

	var order model.PaymentOrder
	if err := model.DB.Preload("Channel").
		Where("order_no = ? AND status = 'pending'", orderNo).First(&order).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 404, "message": "订单不存在或已处理"})
		return
	}

	now := time.Now()
	actualAmount := order.Amount
	if order.Channel != nil && order.Channel.FeeRate > 0 {
		actualAmount = order.Amount * (1 - order.Channel.FeeRate)
	}

	model.DB.Model(&order).Updates(map[string]interface{}{
		"status":        "paid",
		"actual_amount": actualAmount,
		"paid_at":       &now,
	})

	if order.AccountID > 0 {
		service.ConsumeAccount(order.AccountID)
	}

	if order.Channel != nil && order.Channel.FeeRate > 0 {
		commission := model.CommissionRecord{
			OrderID:          order.ID,
			AdminID:          1,
			CommissionRate:   order.Channel.FeeRate,
			CommissionAmount: order.Amount * order.Channel.FeeRate,
			Remark:           "自动抽佣",
		}
		model.DB.Create(&commission)
	}

	go NotifyMerchant(order.ID)
	broadcastNewOrder(order.OrderNo, order.Amount)

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "确认成功"})
}

func MockPayScan(c *gin.Context) {
	orderNo := c.Param("order_no")

	c.Header("Content-Type", "text/html; charset=utf-8")
	html := fmt.Sprintf(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>模拟支付</title>
<style>
body{font-family:sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f5f5f5}
.card{background:#fff;border-radius:12px;padding:40px;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,.1);max-width:400px;width:90%%}
h2{color:#333;margin-bottom:16px}
p{color:#666;margin-bottom:24px}
button{background:linear-gradient(135deg,#722ed1,#9254de);color:#fff;border:none;padding:14px 40px;border-radius:8px;font-size:16px;cursor:pointer}
button:hover{opacity:.9}
.success{color:#52c41a;font-size:24px;display:none}
</style></head><body>
<div class="card">
<h2>模拟支付页面</h2>
<p>订单号: %s</p>
<button onclick="doPay()">确认支付</button>
<div class="success" id="ok">支付成功! 正在跳转...</div>
</div>
<script>
function doPay(){
  fetch('/pay/mock/callback/%s',{method:'POST'})
  .then(r=>r.json()).then(d=>{
    document.querySelector('button').style.display='none';
    document.getElementById('ok').style.display='block';
    setTimeout(()=>{window.close();history.back()},2000);
  });
}
</script></body></html>`, orderNo, orderNo)
	c.String(http.StatusOK, html)
}

func MockPayCallback(c *gin.Context) {
	orderNo := c.Param("order_no")

	var order model.PaymentOrder
	if err := model.DB.Preload("Channel").
		Where("order_no = ? AND status = 'pending'", orderNo).First(&order).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 404, "message": "订单不存在或已处理"})
		return
	}

	now := time.Now()
	actualAmount := order.Amount
	if order.Channel != nil && order.Channel.FeeRate > 0 {
		actualAmount = order.Amount * (1 - order.Channel.FeeRate)
	}

	model.DB.Model(&order).Updates(map[string]interface{}{
		"status":        "paid",
		"actual_amount": actualAmount,
		"paid_at":       &now,
	})

	if order.AccountID > 0 {
		service.ConsumeAccount(order.AccountID)
	}

	if order.Channel != nil && order.Channel.FeeRate > 0 {
		commission := model.CommissionRecord{
			OrderID:          order.ID,
			AdminID:          1,
			CommissionRate:   order.Channel.FeeRate,
			CommissionAmount: order.Amount * order.Channel.FeeRate,
			Remark:           "自动抽佣",
		}
		model.DB.Create(&commission)
	}

	go NotifyMerchant(order.ID)

	broadcastNewOrder(order.OrderNo, order.Amount)

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "支付成功"})
}

func broadcastNewOrder(orderNo string, amount float64) {
	msg := fmt.Sprintf(`{"type":"new_order","order_no":"%s","amount":%.2f}`, orderNo, amount)
	Hub.Broadcast([]byte(msg))
}

// AlipayH5Form 移动端支付宝 H5 跳转
// 直接将用户浏览器重定向到支付宝原始付款链接（qr.alipay.com），
// 支付宝页面会自动尝试唤起 App
// GET /pay/h5/:order_no
func AlipayH5Form(c *gin.Context) {
	orderNo := c.Param("order_no")
	var order model.PaymentOrder
	if err := model.DB.Where("order_no = ?", orderNo).First(&order).Error; err != nil {
		c.String(http.StatusNotFound, "订单不存在")
		return
	}

	if order.PayURL == "" {
		c.String(http.StatusBadRequest, "支付链接尚未生成，请稍后重试")
		return
	}

	// pay_url 存储的是原始支付宝链接（如 https://qr.alipay.com/baxXXX）
	// 直接 302 跳转，支付宝页面会检测移动端并尝试唤起 App
	c.Redirect(http.StatusFound, order.PayURL)
}
