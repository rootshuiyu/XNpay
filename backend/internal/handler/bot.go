package handler

import (
	"io"
	"net/http"
	"strconv"

	"xinipay/internal/bot"
	"xinipay/internal/model"
	"xinipay/pkg"

	"github.com/gin-gonic/gin"
)

func BotGetStatus(c *gin.Context) {
	stats := bot.Bot.GetStats()

	var activeSessions int64
	var totalAccounts int64
	var availableAccounts int64

	model.DB.Model(&model.GameSession{}).Where("status = ?", model.SessionStatusActive).Count(&activeSessions)
	model.DB.Model(&model.GameAccount{}).Count(&totalAccounts)
	model.DB.Model(&model.GameAccount{}).Where("status = ?", model.AccountStatusAvailable).Count(&availableAccounts)

	pkg.Success(c, gin.H{
		"running":            bot.Bot.IsRunning(),
		"stats":              stats,
		"active_sessions":    activeSessions,
		"total_accounts":     totalAccounts,
		"available_accounts": availableAccounts,
		"proxy_enabled":      bot.ProxyPool.IsEnabled(),
		"proxy_count":        len(bot.ProxyPool.List()),
		"proxy_healthy":      bot.ProxyPool.HealthyCount(),
		"platforms":          bot.AllPlatforms(),
	})
}

func BotToggle(c *gin.Context) {
	var req struct {
		Action string `json:"action" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		pkg.Fail(c, 400, "参数错误")
		return
	}

	switch req.Action {
	case "start":
		bot.Bot.Start()
		recordOperationLog(c, "bot.start", "bot", "system", nil)
		pkg.Success(c, gin.H{"message": "Bot已启动"})
	case "stop":
		bot.Bot.Stop()
		recordOperationLog(c, "bot.stop", "bot", "system", nil)
		pkg.Success(c, gin.H{"message": "Bot已停止"})
	default:
		pkg.Fail(c, 400, "无效操作，请使用 start 或 stop")
	}
}

func BotGetSessions(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "20"))

	var total int64
	model.DB.Model(&model.GameSession{}).Count(&total)

	var sessions []model.GameSession
	model.DB.Preload("Account").Order("updated_at DESC").
		Offset((page - 1) * size).Limit(size).Find(&sessions)

	pkg.SuccessWithPage(c, sessions, total, page, size)
}

func BotClearSession(c *gin.Context) {
	id := c.Param("id")
	accountID, _ := strconv.ParseUint(id, 10, 32)
	bot.SM.Remove(uint(accountID))
	recordOperationLog(c, "bot.clear_session", "game_session", id, nil)
	pkg.Success(c, gin.H{"message": "会话已清除"})
}

func BotGetProxies(c *gin.Context) {
	pkg.Success(c, gin.H{
		"enabled": bot.ProxyPool.IsEnabled(),
		"proxies": bot.ProxyPool.List(),
		"healthy": bot.ProxyPool.HealthyCount(),
	})
}

func BotAddProxy(c *gin.Context) {
	var req struct {
		Addr     string `json:"addr" binding:"required"`
		Type     string `json:"type"`
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		pkg.Fail(c, 400, "参数错误")
		return
	}
	if req.Type == "" {
		req.Type = "http"
	}
	bot.ProxyPool.Add(req.Addr, req.Type, req.Username, req.Password)
	recordOperationLog(c, "bot.add_proxy", "proxy", req.Addr, nil)
	pkg.Success(c, gin.H{"message": "代理已添加"})
}

func BotRemoveProxy(c *gin.Context) {
	addr := c.Query("addr")
	if addr == "" {
		pkg.Fail(c, 400, "请提供代理地址")
		return
	}
	bot.ProxyPool.Remove(addr)
	recordOperationLog(c, "bot.remove_proxy", "proxy", addr, nil)
	pkg.Success(c, gin.H{"message": "代理已移除"})
}

func BotToggleProxy(c *gin.Context) {
	var req struct {
		Enabled bool `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		pkg.Fail(c, 400, "参数错误")
		return
	}
	bot.ProxyPool.SetEnabled(req.Enabled)
	recordOperationLog(c, "bot.toggle_proxy", "proxy", "system", gin.H{"enabled": req.Enabled})
	pkg.Success(c, gin.H{"message": "代理池状态已更新", "enabled": req.Enabled})
}

func BotHealthCheck(c *gin.Context) {
	bot.ProxyPool.HealthCheck()
	pkg.Success(c, gin.H{"message": "健康检查已触发"})
}

func BotRetryOrder(c *gin.Context) {
	id := c.Param("id")

	var order model.PaymentOrder
	if err := model.DB.First(&order, id).Error; err != nil {
		pkg.Fail(c, 404, "订单不存在")
		return
	}

	if order.Status != "pending" {
		pkg.Fail(c, 400, "仅待支付订单可重试")
		return
	}

	model.DB.Model(&order).Update("bot_status", bot.BotStatusQueued)
	recordOperationLog(c, "bot.retry_order", "payment_order", id, gin.H{"order_no": order.OrderNo})
	pkg.Success(c, gin.H{"message": "订单已重新加入队列"})
}

func BotGetQRProxy(c *gin.Context) {
	qrURL := c.Query("url")
	if qrURL == "" {
		c.JSON(400, gin.H{"error": "missing url"})
		return
	}

	client := bot.BuildHTTPClient("", "")
	resp, err := client.Get(qrURL)
	if err != nil {
		c.JSON(500, gin.H{"error": "fetch failed"})
		return
	}
	defer resp.Body.Close()

	contentType := resp.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "image/png"
	}

	c.Header("Content-Type", contentType)
	c.Header("Cache-Control", "no-cache")
	io.Copy(c.Writer, resp.Body)
}

func BotGetOrderBot(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "20"))
	status := c.Query("bot_status")

	query := model.DB.Model(&model.PaymentOrder{}).Where("bot_status <> ''")
	if status != "" {
		query = query.Where("bot_status = ?", status)
	}

	var total int64
	query.Count(&total)

	var orders []model.PaymentOrder
	query.Preload("Account").Preload("Channel").
		Order("id DESC").Offset((page - 1) * size).Limit(size).Find(&orders)

	type orderItem struct {
		ID           uint       `json:"id"`
		OrderNo      string     `json:"order_no"`
		Amount       float64    `json:"amount"`
		Status       string     `json:"status"`
		BotStatus    string     `json:"bot_status"`
		GamePlatform string     `json:"game_platform"`
		GameOrderID  string     `json:"game_order_id"`
		QrCode       string     `json:"qr_code"`
		AccountName  string     `json:"account_name"`
		ChannelName  string     `json:"channel_name"`
		CreatedAt    string     `json:"created_at"`
		PaidAt       interface{} `json:"paid_at"`
	}

	items := make([]orderItem, 0, len(orders))
	for _, o := range orders {
		item := orderItem{
			ID:           o.ID,
			OrderNo:      o.OrderNo,
			Amount:       o.Amount,
			Status:       o.Status,
			BotStatus:    o.BotStatus,
			GamePlatform: o.GamePlatform,
			GameOrderID:  o.GameOrderID,
			QrCode:       o.QrCode,
			CreatedAt:    o.CreatedAt.Format("2006-01-02 15:04:05"),
			PaidAt:       o.PaidAt,
		}
		if o.Account != nil {
			item.AccountName = o.Account.AccountName
		}
		if o.Channel != nil {
			item.ChannelName = o.Channel.Name
		}
		items = append(items, item)
	}

	pkg.SuccessWithPage(c, items, total, page, size)
}

// QR code proxy for cashier page (no auth needed)
func PublicQRProxy(c *gin.Context) {
	orderNo := c.Param("order_no")
	var order model.PaymentOrder
	if err := model.DB.Where("order_no = ?", orderNo).First(&order).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "order not found"})
		return
	}

	if order.QrCode == "" {
		c.JSON(http.StatusNotFound, gin.H{"error": "no qr code"})
		return
	}

	client := bot.BuildHTTPClient("", "")
	resp, err := client.Get(order.QrCode)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "fetch failed"})
		return
	}
	defer resp.Body.Close()

	contentType := resp.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "image/png"
	}

	c.Header("Content-Type", contentType)
	c.Header("Cache-Control", "no-cache, no-store")
	io.Copy(c.Writer, resp.Body)
}
