package handler

import (
	"crypto/md5"
	"fmt"
	"math/rand"
	"strconv"
	"strings"
	"time"
	"xinipay/internal/model"
	"xinipay/pkg"

	"github.com/gin-gonic/gin"
)

type CashierRequest struct {
	CashierName string `json:"cashier_name" binding:"required"`
	AccountID   uint   `json:"account_id" binding:"required"`
	Template    string `json:"template"`
	Status      int    `json:"status"`
}

func GetCashiers(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "10"))

	query := model.DB.Model(&model.CashierConfig{})

	var total int64
	query.Count(&total)

	var cashiers []model.CashierConfig
	query.Preload("Account").Order("id DESC").Offset((page - 1) * size).Limit(size).Find(&cashiers)

	pkg.SuccessWithPage(c, cashiers, total, page, size)
}

func CreateCashier(c *gin.Context) {
	var req CashierRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		pkg.Fail(c, 400, "参数错误: "+err.Error())
		return
	}

	hash := md5.Sum([]byte(fmt.Sprintf("%d_%d", req.AccountID, time.Now().UnixNano())))
	cashierURL := fmt.Sprintf("/pay/%x", hash[:8])

	cashier := model.CashierConfig{
		CashierName: req.CashierName,
		CashierURL:  cashierURL,
		AccountID:   req.AccountID,
		Template:    req.Template,
		Status:      req.Status,
	}

	if err := model.DB.Create(&cashier).Error; err != nil {
		pkg.Fail(c, 500, "创建收银台失败")
		return
	}
	pkg.Success(c, cashier)
}

func UpdateCashier(c *gin.Context) {
	id := c.Param("id")
	var cashier model.CashierConfig
	if err := model.DB.First(&cashier, id).Error; err != nil {
		pkg.Fail(c, 404, "收银台不存在")
		return
	}

	var req CashierRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		pkg.Fail(c, 400, "参数错误: "+err.Error())
		return
	}

	model.DB.Model(&cashier).Updates(model.CashierConfig{
		CashierName: req.CashierName,
		AccountID:   req.AccountID,
		Template:    req.Template,
		Status:      req.Status,
	})

	pkg.Success(c, cashier)
}

func DeleteCashier(c *gin.Context) {
	id := c.Param("id")
	if err := model.DB.Delete(&model.CashierConfig{}, id).Error; err != nil {
		pkg.Fail(c, 500, "删除失败")
		return
	}
	pkg.Success(c, nil)
}

// CashierPublicInfo - public endpoint: GET /pay/c/:code
func CashierPublicInfo(c *gin.Context) {
	code := c.Param("code")
	fullURL := "/pay/" + code

	var cashier model.CashierConfig
	if err := model.DB.Preload("Account").Where("cashier_url = ? AND status = 1", fullURL).First(&cashier).Error; err != nil {
		pkg.Fail(c, 404, "收款链接不存在或已禁用")
		return
	}

	pkg.Success(c, gin.H{
		"link_code":     code,
		"title":         cashier.CashierName,
		"channel_name":  "畅游充值",
		"min_amount":    10,
		"max_amount":    3000,
		"quick_amounts": []int{100, 200, 300, 500, 1000},
		"source":        "cashier",
	})
}

// CashierPublicSubmit - public endpoint: POST /pay/c/:code
func CashierPublicSubmit(c *gin.Context) {
	code := c.Param("code")
	fullURL := "/pay/" + code

	var cashier model.CashierConfig
	if err := model.DB.Preload("Account").Where("cashier_url = ? AND status = 1", fullURL).First(&cashier).Error; err != nil {
		pkg.Fail(c, 404, "收款链接不存在或已禁用")
		return
	}

	var req struct {
		Amount    string `json:"amount" binding:"required"`
		PayMethod string `json:"pay_method"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		pkg.Fail(c, 400, "参数错误: "+err.Error())
		return
	}

	// Get client IP
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

	// Find game account
	var accountID uint
	if cashier.Account != nil && cashier.AccountID != 0 {
		accountID = cashier.AccountID
	} else {
		var account model.GameAccount
		if err := model.DB.Where("status = 'available'").First(&account).Error; err != nil {
			pkg.Fail(c, 500, "暂无可用游戏账号，请稍后再试")
			return
		}
		accountID = account.ID
	}

	// Find first available channel
	var channel model.GameChannel
	if err := model.DB.Where("status = 1").First(&channel).Error; err != nil {
		pkg.Fail(c, 500, "暂无可用支付渠道，请稍后再试")
		return
	}

	outTradeNo := fmt.Sprintf("CL%d%04d", time.Now().UnixNano()/1e6, rand.Intn(10000))
	expireAt := time.Now().Add(30 * time.Minute)

	amountVal, _ := strconv.ParseFloat(req.Amount, 64)
	order := model.PaymentOrder{
		OrderNo:      fmt.Sprintf("XN%d%04d", time.Now().UnixNano()/1e6, rand.Intn(10000)),
		OutTradeNo:   outTradeNo,
		MerchantID:   0,
		AccountID:    accountID,
		ChannelID:    channel.ID,
		Amount:       amountVal,
		Subject:      cashier.CashierName,
		Status:       "pending",
		BotStatus:    "queued",
		GamePlatform: "changyou",
		ClientIP:     clientIP,
		ExpireAt:     &expireAt,
	}

	if err := model.DB.Create(&order).Error; err != nil {
		pkg.Fail(c, 500, "创建订单失败: "+err.Error())
		return
	}

	pkg.Success(c, gin.H{
		"order_no":    order.OrderNo,
		"cashier_url": "/cashier/" + order.OrderNo,
		"amount":      order.Amount,
		"expire_at":   order.ExpireAt,
	})
}
