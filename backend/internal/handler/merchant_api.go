package handler

import (
	"encoding/csv"
	"fmt"
	"strconv"
	"strings"
	"time"

	"xinipay/internal/model"
	"xinipay/pkg"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

func getMerchantID(c *gin.Context) uint {
	mid, _ := c.Get("merchant_id")
	return mid.(uint)
}

func MerchantDashboard(c *gin.Context) {
	mid := getMerchantID(c)
	now := time.Now()
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())

	var todayOrders, totalOrders int64
	var todayAmount, totalAmount float64

	model.DB.Model(&model.PaymentOrder{}).Where("merchant_id = ? AND created_at >= ?", mid, todayStart).Count(&todayOrders)
	model.DB.Model(&model.PaymentOrder{}).Where("merchant_id = ? AND created_at >= ? AND status = 'paid'", mid, todayStart).
		Select("COALESCE(SUM(amount), 0)").Scan(&todayAmount)
	model.DB.Model(&model.PaymentOrder{}).Where("merchant_id = ?", mid).Count(&totalOrders)
	model.DB.Model(&model.PaymentOrder{}).Where("merchant_id = ? AND status = 'paid'", mid).
		Select("COALESCE(SUM(amount), 0)").Scan(&totalAmount)

	var totalChannels, totalAccounts, availableAccounts int64
	model.DB.Model(&model.GameChannel{}).Where("merchant_id = ?", mid).Count(&totalChannels)
	model.DB.Model(&model.GameAccount{}).Where("merchant_id = ?", mid).Count(&totalAccounts)
	model.DB.Model(&model.GameAccount{}).Where("merchant_id = ? AND status = ?", mid, model.AccountStatusAvailable).Count(&availableAccounts)

	var subCount int64
	model.DB.Model(&model.Merchant{}).Where("parent_id = ?", mid).Count(&subCount)

	var merchant model.Merchant
	model.DB.First(&merchant, mid)

	pkg.Success(c, gin.H{
		"today_orders":       todayOrders,
		"today_amount":       todayAmount,
		"total_orders":       totalOrders,
		"total_amount":       totalAmount,
		"total_channels":     totalChannels,
		"total_accounts":     totalAccounts,
		"available_accounts": availableAccounts,
		"sub_merchant_count": subCount,
		"balance":            merchant.Balance,
		"frozen_balance":     merchant.FrozenBalance,
	})
}

func MerchantGetChannels(c *gin.Context) {
	mid := getMerchantID(c)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "10"))
	name := c.Query("name")

	query := model.DB.Model(&model.GameChannel{}).Where("merchant_id = ?", mid)
	if name != "" {
		query = query.Where("name LIKE ?", "%"+name+"%")
	}

	var total int64
	query.Count(&total)

	var channels []model.GameChannel
	query.Order("id DESC").Offset((page - 1) * size).Limit(size).Find(&channels)
	pkg.SuccessWithPage(c, channels, total, page, size)
}

func MerchantCreateChannel(c *gin.Context) {
	mid := getMerchantID(c)
	var req ChannelRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		pkg.Fail(c, 400, "参数错误: "+err.Error())
		return
	}

	channel := model.GameChannel{
		MerchantID:  mid,
		Name:        req.Name,
		ChannelCode: req.ChannelCode,
		PaymentType: req.PaymentType,
		GameIcon:    req.GameIcon,
		MinAmount:   req.MinAmount,
		MaxAmount:   req.MaxAmount,
		Description: req.Description,
		FeeRate:     req.FeeRate,
		Status:      req.Status,
		ConfigJSON:  req.ConfigJSON,
	}

	if err := model.DB.Create(&channel).Error; err != nil {
		pkg.Fail(c, 500, "创建渠道失败")
		return
	}
	recordOperationLog(c, "merchant.channel_create", "game_channel", channel.ID, gin.H{"name": channel.Name, "channel_code": channel.ChannelCode})
	pkg.Success(c, channel)
}

func MerchantGetChannelCards(c *gin.Context) {
	mid := getMerchantID(c)

	var channels []model.GameChannel
	model.DB.Where("merchant_id = ? AND status = 1", mid).Order("id DESC").Find(&channels)

	cards := make([]ChannelCardItem, 0, len(channels))
	for _, ch := range channels {
		var total, available, inUse, used, disabled int64
		model.DB.Model(&model.GameAccount{}).Where("channel_id = ? AND merchant_id = ?", ch.ID, mid).Count(&total)
		model.DB.Model(&model.GameAccount{}).Where("channel_id = ? AND merchant_id = ? AND status = ?", ch.ID, mid, model.AccountStatusAvailable).Count(&available)
		model.DB.Model(&model.GameAccount{}).Where("channel_id = ? AND merchant_id = ? AND status = ?", ch.ID, mid, model.AccountStatusInUse).Count(&inUse)
		model.DB.Model(&model.GameAccount{}).Where("channel_id = ? AND merchant_id = ? AND status = ?", ch.ID, mid, model.AccountStatusUsed).Count(&used)
		model.DB.Model(&model.GameAccount{}).Where("channel_id = ? AND merchant_id = ? AND status = ?", ch.ID, mid, model.AccountStatusDisabled).Count(&disabled)

		rate := float64(0)
		if total > 0 {
			rate = float64(available) / float64(total) * 100
		}
		cards = append(cards, ChannelCardItem{
			ID: ch.ID, Name: ch.Name, ChannelCode: ch.ChannelCode,
			PaymentType: ch.PaymentType, GameIcon: ch.GameIcon,
			MinAmount: ch.MinAmount, MaxAmount: ch.MaxAmount,
			Description: ch.Description, FeeRate: ch.FeeRate, Status: ch.Status,
			TotalAccounts: total, AvailableAccounts: available,
			InUseAccounts: inUse, UsedAccounts: used, DisabledAccounts: disabled,
			AvailableRate: rate,
		})
	}
	pkg.Success(c, cards)
}

func MerchantGetAccounts(c *gin.Context) {
	mid := getMerchantID(c)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "10"))
	name := c.Query("name")
	status := c.Query("status")

	query := model.DB.Model(&model.GameAccount{}).Where("merchant_id = ?", mid)
	if name != "" {
		query = query.Where("account_name LIKE ? OR game_name LIKE ?", "%"+name+"%", "%"+name+"%")
	}
	if status != "" {
		query = query.Where("status = ?", status)
	}

	var total int64
	query.Count(&total)

	var accounts []model.GameAccount
	query.Preload("Channel").Order("id DESC").Offset((page - 1) * size).Limit(size).Find(&accounts)
	pkg.SuccessWithPage(c, accounts, total, page, size)
}

func MerchantCreateAccount(c *gin.Context) {
	mid := getMerchantID(c)
	var req AccountRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		pkg.Fail(c, 400, "参数错误: "+err.Error())
		return
	}

	var ch model.GameChannel
	if err := model.DB.Where("id = ? AND merchant_id = ?", req.ChannelID, mid).First(&ch).Error; err != nil {
		pkg.Fail(c, 400, "渠道不存在或不属于您")
		return
	}

	status := req.Status
	if status == "" {
		status = model.AccountStatusAvailable
	}

	account := model.GameAccount{
		MerchantID:  mid,
		ChannelID:   req.ChannelID,
		AccountName: req.AccountName,
		Password:    req.Password,
		GameName:    req.GameName,
		AppID:       req.AppID,
		AppSecret:   req.AppSecret,
		LoginInfo:   req.LoginInfo,
		Status:      status,
		Remark:      req.Remark,
	}

	if err := model.DB.Create(&account).Error; err != nil {
		pkg.Fail(c, 500, "创建账号失败")
		return
	}
	recordOperationLog(c, "merchant.account_create", "game_account", account.ID, gin.H{"channel_id": account.ChannelID, "account_name": account.AccountName})
	pkg.Success(c, account)
}

func MerchantBatchImport(c *gin.Context) {
	mid := getMerchantID(c)
	var req BatchImportRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		pkg.Fail(c, 400, "参数错误: "+err.Error())
		return
	}

	var ch model.GameChannel
	if err := model.DB.Where("id = ? AND merchant_id = ?", req.ChannelID, mid).First(&ch).Error; err != nil {
		pkg.Fail(c, 400, "渠道不存在或不属于您")
		return
	}

	items := req.Accounts
	if len(items) == 0 && req.Text != "" {
		lines := strings.Split(strings.TrimSpace(req.Text), "\n")
		for _, line := range lines {
			line = strings.TrimSpace(line)
			if line == "" {
				continue
			}
			parts := strings.SplitN(line, "----", 2)
			name := strings.TrimSpace(parts[0])
			pwd := ""
			if len(parts) > 1 {
				pwd = strings.TrimSpace(parts[1])
			}
			if name != "" {
				items = append(items, BatchImportItem{AccountName: name, Password: pwd, GameName: ch.Name})
			}
		}
	}

	if len(items) == 0 {
		pkg.Fail(c, 400, "没有可导入的账号数据")
		return
	}

	created := 0
	for _, item := range items {
		gameName := item.GameName
		if gameName == "" {
			gameName = ch.Name
		}
		account := model.GameAccount{
			MerchantID:  mid,
			ChannelID:   req.ChannelID,
			AccountName: item.AccountName,
			Password:    item.Password,
			GameName:    gameName,
			Status:      model.AccountStatusAvailable,
			Remark:      item.Remark,
		}
		if err := model.DB.Create(&account).Error; err == nil {
			created++
		}
	}
	recordOperationLog(c, "merchant.account_batch_import", "game_account", req.ChannelID, gin.H{"total": len(items), "created": created})
	pkg.Success(c, gin.H{"total": len(items), "created": created})
}

func MerchantGetOrders(c *gin.Context) {
	mid := getMerchantID(c)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "10"))
	status := c.Query("status")

	query := model.DB.Model(&model.PaymentOrder{}).Where("merchant_id = ?", mid)
	if status != "" {
		query = query.Where("status = ?", status)
	}

	var total int64
	query.Count(&total)

	var orders []model.PaymentOrder
	query.Preload("Channel").Order("id DESC").Offset((page - 1) * size).Limit(size).Find(&orders)
	pkg.SuccessWithPage(c, orders, total, page, size)
}

func MerchantExportOrders(c *gin.Context) {
	mid := getMerchantID(c)
	status := c.Query("status")

	query := model.DB.Model(&model.PaymentOrder{}).Where("merchant_id = ?", mid).Preload("Channel")
	if status != "" {
		query = query.Where("status = ?", status)
	}

	var orders []model.PaymentOrder
	query.Order("id DESC").Find(&orders)

	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=merchant_orders_%s.csv", time.Now().Format("20060102150405")))
	c.Writer.Write([]byte{0xEF, 0xBB, 0xBF})

	writer := csv.NewWriter(c.Writer)
	writer.Write([]string{"订单号", "通道", "金额", "实际金额", "状态", "回调状态", "创建时间", "支付时间"})
	for _, o := range orders {
		channelName := ""
		if o.Channel != nil {
			channelName = o.Channel.Name
		}
		paidAt := ""
		if o.PaidAt != nil {
			paidAt = o.PaidAt.Format("2006-01-02 15:04:05")
		}
		writer.Write([]string{
			o.OrderNo,
			channelName,
			fmt.Sprintf("%.2f", o.Amount),
			fmt.Sprintf("%.2f", o.ActualAmount),
			o.Status,
			o.NotifyStatus,
			o.CreatedAt.Format("2006-01-02 15:04:05"),
			paidAt,
		})
	}
	writer.Flush()
	recordOperationLog(c, "merchant.order_export", "payment_order", "merchant", gin.H{"merchant_id": mid, "count": len(orders)})
}

func MerchantGetSubMerchants(c *gin.Context) {
	mid := getMerchantID(c)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "10"))

	query := model.DB.Model(&model.Merchant{}).Where("parent_id = ?", mid)

	var total int64
	query.Count(&total)

	var merchants []model.Merchant
	query.Order("id DESC").Offset((page - 1) * size).Limit(size).Find(&merchants)

	type SubMerchantItem struct {
		model.Merchant
		SubCount     int64   `json:"sub_count"`
		TotalOrders  int64   `json:"total_orders"`
		TotalAmount  float64 `json:"total_amount"`
	}

	items := make([]SubMerchantItem, 0, len(merchants))
	for _, m := range merchants {
		var subCount, orderCount int64
		var orderAmount float64
		model.DB.Model(&model.Merchant{}).Where("parent_id = ?", m.ID).Count(&subCount)
		model.DB.Model(&model.PaymentOrder{}).Where("merchant_id = ?", m.ID).Count(&orderCount)
		model.DB.Model(&model.PaymentOrder{}).Where("merchant_id = ? AND status = 'paid'", m.ID).
			Select("COALESCE(SUM(amount), 0)").Scan(&orderAmount)
		items = append(items, SubMerchantItem{
			Merchant:    m,
			SubCount:    subCount,
			TotalOrders: orderCount,
			TotalAmount: orderAmount,
		})
	}

	pkg.SuccessWithPage(c, items, total, page, size)
}

func MerchantCreateSub(c *gin.Context) {
	mid := getMerchantID(c)

	var parent model.Merchant
	if err := model.DB.First(&parent, mid).Error; err != nil {
		pkg.Fail(c, 400, "商户不存在")
		return
	}

	var req struct {
		Username string  `json:"username" binding:"required"`
		Password string  `json:"password" binding:"required,min=6"`
		Nickname string  `json:"nickname"`
		FeeRate  float64 `json:"fee_rate"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		pkg.Fail(c, 400, "参数错误: "+err.Error())
		return
	}

	var exists int64
	model.DB.Model(&model.Merchant{}).Where("username = ?", req.Username).Count(&exists)
	if exists > 0 {
		pkg.Fail(c, 400, "用户名已存在")
		return
	}

	hash, _ := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	nickname := req.Nickname
	if nickname == "" {
		nickname = req.Username
	}
	feeRate := req.FeeRate
	if feeRate <= 0 || feeRate > parent.FeeRate {
		feeRate = parent.FeeRate
	}

	sub := model.Merchant{
		ParentID:     &mid,
		Username:     req.Username,
		PasswordHash: string(hash),
		Nickname:     nickname,
		InviteCode:   model.GenerateInviteCode(),
		FeeRate:      feeRate,
		Level:        parent.Level + 1,
		Status:       1,
	}

	if err := model.DB.Create(&sub).Error; err != nil {
		pkg.Fail(c, 500, "创建下级失败")
		return
	}

	sub.Path = parent.Path + "/" + strconv.Itoa(int(sub.ID))
	model.DB.Save(&sub)
	recordOperationLog(c, "merchant.sub_create", "merchant", sub.ID, gin.H{"username": sub.Username, "parent_id": mid})
	pkg.Success(c, sub)
}

func MerchantSetSubRate(c *gin.Context) {
	mid := getMerchantID(c)
	subID := c.Param("id")

	var sub model.Merchant
	if err := model.DB.Where("id = ? AND parent_id = ?", subID, mid).First(&sub).Error; err != nil {
		pkg.Fail(c, 404, "下级商户不存在")
		return
	}

	var req struct {
		FeeRate float64 `json:"fee_rate" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		pkg.Fail(c, 400, "参数错误")
		return
	}

	var parent model.Merchant
	model.DB.First(&parent, mid)
	if req.FeeRate > parent.FeeRate {
		pkg.Fail(c, 400, "下级费率不能超过您的费率")
		return
	}

	model.DB.Model(&sub).Update("fee_rate", req.FeeRate)
	recordOperationLog(c, "merchant.sub_rate_update", "merchant", sub.ID, req)
	pkg.Success(c, nil)
}

func MerchantGetInviteCode(c *gin.Context) {
	mid := getMerchantID(c)
	var merchant model.Merchant
	model.DB.First(&merchant, mid)
	pkg.Success(c, gin.H{"invite_code": merchant.InviteCode})
}

func MerchantRefreshInviteCode(c *gin.Context) {
	mid := getMerchantID(c)
	newCode := model.GenerateInviteCode()
	model.DB.Model(&model.Merchant{}).Where("id = ?", mid).Update("invite_code", newCode)
	recordOperationLog(c, "merchant.invite_refresh", "merchant", mid, gin.H{"invite_code": newCode})
	pkg.Success(c, gin.H{"invite_code": newCode})
}

func MerchantGetBalance(c *gin.Context) {
	mid := getMerchantID(c)
	var merchant model.Merchant
	model.DB.First(&merchant, mid)

	var totalEarned float64
	model.DB.Model(&model.CommissionRecord{}).
		Where("admin_id = ?", mid).
		Select("COALESCE(SUM(commission_amount), 0)").Scan(&totalEarned)

	pkg.Success(c, gin.H{
		"balance":        merchant.Balance,
		"frozen_balance": merchant.FrozenBalance,
		"total_earned":   totalEarned,
		"fee_rate":       merchant.FeeRate,
	})
}
