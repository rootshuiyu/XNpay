package handler

import (
	"fmt"
	"net/http"
	"net/url"
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

// AlipayH5Form 移动端支付宝唤起页
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

	qrURL := order.PayURL
	schemeQR := "alipays://platformapi/startapp?saId=10000007&qrcode=" + url.QueryEscape(qrURL)
	schemeURL := "alipays://platformapi/startapp?appId=20000067&url=" + url.QueryEscape(qrURL)
	bridgeURL := "https://render.alipay.com/p/s/i/?scheme=" + url.QueryEscape(schemeQR)
	intentURL := "intent://platformapi/startapp?saId=10000007&qrcode=" + url.QueryEscape(qrURL) + "#Intent;scheme=alipays;package=com.eg.android.AlipayGshi;end"

	html := fmt.Sprintf(`<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>正在打开支付宝...</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
background:linear-gradient(135deg,#1677ff 0%%,#0958d9 100%%);min-height:100vh;
display:flex;align-items:center;justify-content:center;padding:20px}
.card{background:#fff;border-radius:20px;padding:40px 28px;text-align:center;
max-width:340px;width:100%%;box-shadow:0 8px 32px rgba(0,0,0,0.15)}
.icon{width:72px;height:72px;margin:0 auto 20px;background:#1677ff;border-radius:50%%;
display:flex;align-items:center;justify-content:center}
.icon svg{width:40px;height:40px}
h2{font-size:20px;color:#111;margin-bottom:8px}
.sub{font-size:14px;color:#888;margin-bottom:28px}
.btn{display:block;width:100%%;padding:16px;border:none;border-radius:12px;
font-size:17px;font-weight:700;cursor:pointer;margin-bottom:12px;text-decoration:none;
text-align:center;letter-spacing:0.5px;transition:opacity 0.2s}
.btn:active{opacity:0.8}
.btn-primary{background:linear-gradient(135deg,#1677ff,#0958d9);color:#fff;
box-shadow:0 4px 16px rgba(22,119,255,0.35)}
.btn-outline{background:#fff;color:#1677ff;border:1.5px solid #1677ff}
.btn-green{background:#06b6d4;color:#fff;font-size:14px;padding:12px}
.btn-link{background:none;border:none;color:#999;font-size:13px;padding:8px;font-weight:400}
.status{font-size:13px;color:#aaa;margin-top:16px}
.dot{display:inline-block;width:6px;height:6px;border-radius:50%%;background:#52c41a;
margin-right:6px;animation:pulse 1.5s ease-in-out infinite}
@keyframes pulse{0%%,100%%{opacity:1}50%%{opacity:0.3}}
#tip{font-size:12px;color:#bbb;margin-top:12px;display:none}
</style>
</head><body>
<div class="card">
<div class="icon">
<svg viewBox="0 0 40 40" fill="none">
<path d="M20 3C10.6 3 3 10.6 3 20s7.6 17 17 17 17-7.6 17-17S29.4 3 20 3zm5.4 17.6c-1.4.6-4.1-.5-6.4-2-1.4 1.4-2.9 2.5-4.1 2.5-1.4 0-2.3-.9-2.3-2.1 0-1.4 1.2-2.3 2.7-2.3.7 0 1.6.2 2.5.6.5-.6.8-1.4 1.1-2.1h-5v-.9h2.7v-.9h-3.2V14h2v-1.4h1.8V14h2.7v.9H17v.9h2.9c-.3.9-.7 1.8-1.3 2.6 1.4.7 2.7 1.2 3.6 1.2.7 0 1.1-.3 1.1-.7s-.5-.8-1.4-1.3l.9-.6c1.1.6 1.8 1.3 1.8 2.3 0 .6-.3 1.2-.5 1.6z" fill="white"/>
</svg>
</div>
<h2 id="title">正在打开支付宝...</h2>
<p class="sub" id="subtitle">请稍候，正在跳转到支付宝</p>

<a id="btnPrimary" class="btn btn-primary" href="%s">
打开支付宝付款
</a>

<a id="btnBridge" class="btn btn-outline" href="%s">
备用方式打开
</a>

<a id="btnDirect" class="btn btn-green" href="%s">
直接跳转支付
</a>

<a class="btn btn-link" href="%s">
复制链接到支付宝打开
</a>

<div class="status"><span class="dot"></span>正在等待支付完成...</div>
<div id="tip"></div>
</div>

<script>
(function(){
  var qrUrl = %q;
  var schemeQR = %q;
  var schemeURL = %q;
  var intentUrl = %q;
  var bridgeUrl = %q;

  var isAndroid = /android/i.test(navigator.userAgent);
  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  var launched = false;
  var t0 = Date.now();

  function tryScheme(url) {
    var a = document.createElement('a');
    a.href = url;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function checkIfLeft() {
    if (document.hidden || document.webkitHidden) { launched = true; }
  }
  document.addEventListener('visibilitychange', checkIfLeft);
  document.addEventListener('webkitvisibilitychange', checkIfLeft);

  if (isAndroid) {
    // Android: intent:// 最可靠
    try { window.location.href = intentUrl; } catch(e){}
    setTimeout(function(){
      if (!launched) { try { tryScheme(schemeQR); } catch(e){} }
    }, 500);
    setTimeout(function(){
      if (!launched) { window.location.href = bridgeUrl; }
    }, 2000);
  } else if (isIOS) {
    // iOS: 先用 scheme，再用 render.alipay.com
    try { window.location.href = schemeQR; } catch(e){}
    setTimeout(function(){
      if (!launched) { try { window.location.href = schemeURL; } catch(e){} }
    }, 400);
    setTimeout(function(){
      if (!launched) { window.location.href = bridgeUrl; }
    }, 1500);
  } else {
    // PC: 直接跳转 qr.alipay.com（会显示二维码）
    window.location.href = qrUrl;
  }

  // 3秒后显示提示
  setTimeout(function(){
    if (!launched) {
      document.getElementById('title').textContent = '请点击按钮打开支付宝';
      document.getElementById('subtitle').textContent = '如果支付宝未自动打开，请手动点击下方按钮';
      document.getElementById('tip').style.display = 'block';
      document.getElementById('tip').textContent = '提示：请确保已安装支付宝APP';
    }
  }, 3000);
})();
</script>
</body></html>`, schemeQR, bridgeURL, qrURL, qrURL, qrURL, schemeQR, schemeURL, intentURL, bridgeURL)

	c.Header("Content-Type", "text/html; charset=utf-8")
	c.Header("Cache-Control", "no-cache, no-store")
	c.String(http.StatusOK, html)
}
