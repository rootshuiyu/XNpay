package handler

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"xinipay/internal/bot"
	"xinipay/internal/model"
	"xinipay/internal/service"
	"xinipay/pkg"

	"github.com/gin-gonic/gin"
)

func generateLinkCode() string {
	b := make([]byte, 4)
	rand.Read(b)
	return hex.EncodeToString(b)
}

// --- Public endpoints (no auth required) ---

// PayLinkInfo 获取收款链接基本信息（给用户填写金额页面用）
func PayLinkInfo(c *gin.Context) {
	linkCode := c.Param("link_code")
	var link model.PaymentLink
	if err := model.DB.Preload("Channel").Where("link_code = ? AND status = 1", linkCode).First(&link).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 404, "message": "收款链接不存在或已禁用"})
		return
	}

	if link.ExpireAt != nil && link.ExpireAt.Before(time.Now()) {
		c.JSON(http.StatusOK, gin.H{"code": 400, "message": "收款链接已过期"})
		return
	}

	quickAmounts := []int{100, 200, 300, 500, 1000}
	if link.QuickAmounts != "" {
		json.Unmarshal([]byte(link.QuickAmounts), &quickAmounts)
	}

	channelName := "游戏充值"
	if link.Channel != nil {
		channelName = link.Channel.Name
	}

	c.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": gin.H{
			"link_code":     link.LinkCode,
			"title":         link.Title,
			"channel_name":  channelName,
			"min_amount":    link.MinAmount,
			"max_amount":    link.MaxAmount,
			"quick_amounts": quickAmounts,
		},
	})
}

// PayLinkSubmit 用户提交金额+支付方式，创建订单并返回收银台 URL
func PayLinkSubmit(c *gin.Context) {
	linkCode := c.Param("link_code")
	var link model.PaymentLink
	if err := model.DB.Preload("Channel").Where("link_code = ? AND status = 1", linkCode).First(&link).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 404, "message": "收款链接不存在"})
		return
	}

	if link.ExpireAt != nil && link.ExpireAt.Before(time.Now()) {
		c.JSON(http.StatusOK, gin.H{"code": 400, "message": "收款链接已过期"})
		return
	}

	var body struct {
		Amount    string `json:"amount" binding:"required"`
		PayMethod string `json:"pay_method"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 400, "message": "参数错误"})
		return
	}

	amount, err := strconv.ParseFloat(body.Amount, 64)
	if err != nil || amount <= 0 {
		c.JSON(http.StatusOK, gin.H{"code": 400, "message": "金额格式错误"})
		return
	}
	if link.MinAmount > 0 && amount < link.MinAmount {
		c.JSON(http.StatusOK, gin.H{"code": 400, "message": fmt.Sprintf("最低充值 ¥%.0f", link.MinAmount)})
		return
	}
	if link.MaxAmount > 0 && amount > link.MaxAmount {
		c.JSON(http.StatusOK, gin.H{"code": 400, "message": fmt.Sprintf("最高充值 ¥%.0f", link.MaxAmount)})
		return
	}

	if link.Channel == nil || link.Channel.Status == 0 {
		c.JSON(http.StatusOK, gin.H{"code": 400, "message": "通道不可用"})
		return
	}

	orderNo := pkg.GenerateOrderNo()
	subject := link.Title
	if subject == "" {
		subject = link.Channel.Name + " - 充值"
	}

	notifyURL := link.NotifyURL
	returnURL := link.ReturnURL

	clientIP := c.GetHeader("X-Forwarded-For")
	if clientIP == "" {
		clientIP = c.GetHeader("X-Real-IP")
	}
	if clientIP == "" {
		clientIP = c.ClientIP()
	}
	if idx := strings.Index(clientIP, ","); idx != -1 {
		clientIP = strings.TrimSpace(clientIP[:idx])
	}

	order := model.PaymentOrder{
		MerchantID:   link.MerchantID,
		OrderNo:      orderNo,
		OutTradeNo:   orderNo,
		ChannelID:    link.ChannelID,
		Amount:       amount,
		Subject:      subject,
		Status:       "pending",
		NotifyURL:    notifyURL,
		ReturnURL:    returnURL,
		NotifyStatus: "pending",
		PayMethod:    body.PayMethod,
		ClientIP:     clientIP,
		ExpireAt:     func() *time.Time { t := time.Now().Add(getOrderTimeoutDuration()); return &t }(),
	}

	assigned, assignErr := service.AssignAccount(link.ChannelID, 0)
	if assignErr != nil {
		c.JSON(http.StatusOK, gin.H{"code": 500, "message": "暂无可用账号，请稍后重试"})
		return
	}
	order.AccountID = assigned.ID

	if err := model.DB.Create(&order).Error; err != nil {
		service.ReleaseAccount(assigned.ID)
		c.JSON(http.StatusOK, gin.H{"code": 500, "message": "创建订单失败"})
		return
	}

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
		},
	})
}

// --- Admin CRUD endpoints ---

type CreatePayLinkRequest struct {
	ChannelID    uint    `json:"channel_id" binding:"required"`
	Title        string  `json:"title" binding:"required"`
	MinAmount    float64 `json:"min_amount"`
	MaxAmount    float64 `json:"max_amount"`
	QuickAmounts string  `json:"quick_amounts"`
	NotifyURL    string  `json:"notify_url"`
	ReturnURL    string  `json:"return_url"`
}

func AdminGetPayLinks(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "20"))
	if page < 1 {
		page = 1
	}

	var links []model.PaymentLink
	var total int64

	db := model.DB.Preload("Channel").Model(&model.PaymentLink{})
	db.Count(&total)
	db.Order("id desc").Offset((page - 1) * size).Limit(size).Find(&links)

	c.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": gin.H{"list": links, "total": total, "page": page, "size": size},
	})
}

func AdminCreatePayLink(c *gin.Context) {
	var req CreatePayLinkRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 400, "message": "参数错误: " + err.Error()})
		return
	}

	if req.MinAmount == 0 {
		req.MinAmount = 10
	}
	if req.MaxAmount == 0 {
		req.MaxAmount = 3000
	}
	if req.QuickAmounts == "" {
		req.QuickAmounts = "[100,200,300,500,1000]"
	}

	link := model.PaymentLink{
		LinkCode:     generateLinkCode(),
		ChannelID:    req.ChannelID,
		Title:        req.Title,
		MinAmount:    req.MinAmount,
		MaxAmount:    req.MaxAmount,
		QuickAmounts: req.QuickAmounts,
		NotifyURL:    req.NotifyURL,
		ReturnURL:    req.ReturnURL,
		Status:       1,
	}

	// 从 JWT 取 merchantID（admin 时为 0）
	if mid, ok := c.Get("merchant_id"); ok {
		if v, ok := mid.(uint); ok {
			link.MerchantID = v
		}
	}

	if err := model.DB.Create(&link).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 500, "message": "创建失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": link})
}

func AdminUpdatePayLink(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var link model.PaymentLink
	if err := model.DB.First(&link, id).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 404, "message": "不存在"})
		return
	}

	var body map[string]interface{}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 400, "message": "参数错误"})
		return
	}

	model.DB.Model(&link).Updates(body)
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "更新成功"})
}

func AdminDeletePayLink(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	model.DB.Delete(&model.PaymentLink{}, id)
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "删除成功"})
}

func AdminTogglePayLink(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var link model.PaymentLink
	if err := model.DB.First(&link, id).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 404, "message": "不存在"})
		return
	}
	newStatus := 1
	if link.Status == 1 {
		newStatus = 0
	}
	model.DB.Model(&link).Update("status", newStatus)
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"status": newStatus}})
}
