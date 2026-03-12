package handler

import (
	"strconv"
	"xinipay/internal/model"
	"xinipay/pkg"

	"github.com/gin-gonic/gin"
)

type ChannelRequest struct {
	Name        string  `json:"name" binding:"required"`
	ChannelCode string  `json:"channel_code" binding:"required"`
	PaymentType string  `json:"payment_type" binding:"required"`
	GameIcon    string  `json:"game_icon"`
	MinAmount   float64 `json:"min_amount"`
	MaxAmount   float64 `json:"max_amount"`
	Description string  `json:"description"`
	FeeRate     float64 `json:"fee_rate"`
	Status      int     `json:"status"`
	ConfigJSON  string  `json:"config_json"`
}

type ChannelStats struct {
	TotalChannels    int64 `json:"total_channels"`
	TotalAccounts    int64 `json:"total_accounts"`
	AvailableAccounts int64 `json:"available_accounts"`
	InUseAccounts    int64 `json:"in_use_accounts"`
	UsedAccounts     int64 `json:"used_accounts"`
	DisabledAccounts int64 `json:"disabled_accounts"`
}

func GetChannelStats(c *gin.Context) {
	var stats ChannelStats
	model.DB.Model(&model.GameChannel{}).Count(&stats.TotalChannels)
	model.DB.Model(&model.GameAccount{}).Count(&stats.TotalAccounts)
	model.DB.Model(&model.GameAccount{}).Where("status = ?", model.AccountStatusAvailable).Count(&stats.AvailableAccounts)
	model.DB.Model(&model.GameAccount{}).Where("status = ?", model.AccountStatusInUse).Count(&stats.InUseAccounts)
	model.DB.Model(&model.GameAccount{}).Where("status = ?", model.AccountStatusUsed).Count(&stats.UsedAccounts)
	model.DB.Model(&model.GameAccount{}).Where("status = ?", model.AccountStatusDisabled).Count(&stats.DisabledAccounts)
	pkg.Success(c, stats)
}

type ChannelCardItem struct {
	ID               uint    `json:"id"`
	Name             string  `json:"name"`
	ChannelCode      string  `json:"channel_code"`
	PaymentType      string  `json:"payment_type"`
	GameIcon         string  `json:"game_icon"`
	MinAmount        float64 `json:"min_amount"`
	MaxAmount        float64 `json:"max_amount"`
	Description      string  `json:"description"`
	FeeRate          float64 `json:"fee_rate"`
	Status           int     `json:"status"`
	TotalAccounts    int64   `json:"total_accounts"`
	AvailableAccounts int64  `json:"available_accounts"`
	InUseAccounts    int64   `json:"in_use_accounts"`
	UsedAccounts     int64   `json:"used_accounts"`
	DisabledAccounts int64   `json:"disabled_accounts"`
	AvailableRate    float64 `json:"available_rate"`
}

func GetChannelCardList(c *gin.Context) {
	var channels []model.GameChannel
	model.DB.Where("status = 1").Order("id DESC").Find(&channels)

	cards := make([]ChannelCardItem, 0, len(channels))
	for _, ch := range channels {
		var total, available, inUse, used, disabled int64
		base := model.DB.Model(&model.GameAccount{}).Where("channel_id = ?", ch.ID)
		base.Count(&total)
		model.DB.Model(&model.GameAccount{}).Where("channel_id = ? AND status = ?", ch.ID, model.AccountStatusAvailable).Count(&available)
		model.DB.Model(&model.GameAccount{}).Where("channel_id = ? AND status = ?", ch.ID, model.AccountStatusInUse).Count(&inUse)
		model.DB.Model(&model.GameAccount{}).Where("channel_id = ? AND status = ?", ch.ID, model.AccountStatusUsed).Count(&used)
		model.DB.Model(&model.GameAccount{}).Where("channel_id = ? AND status = ?", ch.ID, model.AccountStatusDisabled).Count(&disabled)

		rate := float64(0)
		if total > 0 {
			rate = float64(available) / float64(total) * 100
		}

		cards = append(cards, ChannelCardItem{
			ID:                ch.ID,
			Name:              ch.Name,
			ChannelCode:       ch.ChannelCode,
			PaymentType:       ch.PaymentType,
			GameIcon:          ch.GameIcon,
			MinAmount:         ch.MinAmount,
			MaxAmount:         ch.MaxAmount,
			Description:       ch.Description,
			FeeRate:           ch.FeeRate,
			Status:            ch.Status,
			TotalAccounts:     total,
			AvailableAccounts: available,
			InUseAccounts:     inUse,
			UsedAccounts:      used,
			DisabledAccounts:  disabled,
			AvailableRate:     rate,
		})
	}
	pkg.Success(c, cards)
}

func GetChannels(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "10"))
	name := c.Query("name")
	status := c.Query("status")

	query := model.DB.Model(&model.GameChannel{})
	if name != "" {
		query = query.Where("name LIKE ?", "%"+name+"%")
	}
	if status != "" {
		query = query.Where("status = ?", status)
	}

	var total int64
	query.Count(&total)

	var channels []model.GameChannel
	query.Order("id DESC").Offset((page - 1) * size).Limit(size).Find(&channels)

	pkg.SuccessWithPage(c, channels, total, page, size)
}

func CreateChannel(c *gin.Context) {
	var req ChannelRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		pkg.Fail(c, 400, "参数错误: "+err.Error())
		return
	}

	channel := model.GameChannel{
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
	pkg.Success(c, channel)
}

func UpdateChannel(c *gin.Context) {
	id := c.Param("id")
	var channel model.GameChannel
	if err := model.DB.First(&channel, id).Error; err != nil {
		pkg.Fail(c, 404, "渠道不存在")
		return
	}

	var req ChannelRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		pkg.Fail(c, 400, "参数错误: "+err.Error())
		return
	}

	model.DB.Model(&channel).Updates(map[string]interface{}{
		"name":         req.Name,
		"channel_code": req.ChannelCode,
		"payment_type": req.PaymentType,
		"game_icon":    req.GameIcon,
		"min_amount":   req.MinAmount,
		"max_amount":   req.MaxAmount,
		"description":  req.Description,
		"fee_rate":     req.FeeRate,
		"status":       req.Status,
		"config_json":  req.ConfigJSON,
	})

	pkg.Success(c, channel)
}

func DeleteChannel(c *gin.Context) {
	id := c.Param("id")

	var count int64
	model.DB.Model(&model.GameAccount{}).Where("channel_id = ?", id).Count(&count)
	if count > 0 {
		pkg.Fail(c, 400, "该渠道下有关联账号，无法删除")
		return
	}

	if err := model.DB.Delete(&model.GameChannel{}, id).Error; err != nil {
		pkg.Fail(c, 500, "删除失败")
		return
	}
	pkg.Success(c, nil)
}

func ToggleChannelStatus(c *gin.Context) {
	id := c.Param("id")
	var channel model.GameChannel
	if err := model.DB.First(&channel, id).Error; err != nil {
		pkg.Fail(c, 404, "渠道不存在")
		return
	}

	newStatus := 1
	if channel.Status == 1 {
		newStatus = 0
	}
	model.DB.Model(&channel).Update("status", newStatus)
	pkg.Success(c, nil)
}
