package handler

import (
	"strconv"
	"strings"
	"xinipay/internal/model"
	"xinipay/pkg"

	"github.com/gin-gonic/gin"
)

type AccountRequest struct {
	ChannelID   uint   `json:"channel_id" binding:"required"`
	AccountName string `json:"account_name" binding:"required"`
	Password    string `json:"password"`
	GameName    string `json:"game_name" binding:"required"`
	AppID       string `json:"app_id"`
	AppSecret   string `json:"app_secret"`
	LoginInfo   string `json:"login_info"`
	Status      string `json:"status"`
	Remark      string `json:"remark"`
}

func GetAccounts(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "10"))
	name := c.Query("name")
	channelID := c.Query("channel_id")
	status := c.Query("status")

	query := model.DB.Model(&model.GameAccount{})
	if name != "" {
		query = query.Where("account_name LIKE ? OR game_name LIKE ?", "%"+name+"%", "%"+name+"%")
	}
	if channelID != "" {
		query = query.Where("channel_id = ?", channelID)
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

func CreateAccount(c *gin.Context) {
	var req AccountRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		pkg.Fail(c, 400, "参数错误: "+err.Error())
		return
	}

	var ch model.GameChannel
	if err := model.DB.First(&ch, req.ChannelID).Error; err != nil {
		pkg.Fail(c, 400, "指定渠道不存在")
		return
	}

	status := req.Status
	if status == "" {
		status = model.AccountStatusAvailable
	}

	account := model.GameAccount{
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
	recordOperationLog(c, "account.create", "game_account", account.ID, gin.H{"channel_id": account.ChannelID, "account_name": account.AccountName})
	pkg.Success(c, account)
}

func UpdateAccount(c *gin.Context) {
	id := c.Param("id")
	var account model.GameAccount
	if err := model.DB.First(&account, id).Error; err != nil {
		pkg.Fail(c, 404, "账号不存在")
		return
	}

	var req AccountRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		pkg.Fail(c, 400, "参数错误: "+err.Error())
		return
	}

	model.DB.Model(&account).Updates(map[string]interface{}{
		"channel_id":   req.ChannelID,
		"account_name": req.AccountName,
		"password":     req.Password,
		"game_name":    req.GameName,
		"app_id":       req.AppID,
		"app_secret":   req.AppSecret,
		"login_info":   req.LoginInfo,
		"status":       req.Status,
		"remark":       req.Remark,
	})

	recordOperationLog(c, "account.update", "game_account", account.ID, req)
	pkg.Success(c, account)
}

func DeleteAccount(c *gin.Context) {
	id := c.Param("id")

	var count int64
	model.DB.Model(&model.PaymentOrder{}).Where("account_id = ?", id).Count(&count)
	if count > 0 {
		pkg.Fail(c, 400, "该账号有关联订单，无法删除")
		return
	}

	if err := model.DB.Delete(&model.GameAccount{}, id).Error; err != nil {
		pkg.Fail(c, 500, "删除失败")
		return
	}
	recordOperationLog(c, "account.delete", "game_account", id, nil)
	pkg.Success(c, nil)
}

type BatchImportItem struct {
	AccountName string `json:"account_name"`
	Password    string `json:"password"`
	GameName    string `json:"game_name"`
	AppID       string `json:"app_id"`
	AppSecret   string `json:"app_secret"`
	LoginInfo   string `json:"login_info"`
	Remark      string `json:"remark"`
}

type BatchImportRequest struct {
	ChannelID uint              `json:"channel_id" binding:"required"`
	Accounts  []BatchImportItem `json:"accounts"`
	Text      string            `json:"text"`
}

func BatchImportAccounts(c *gin.Context) {
	var req BatchImportRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		pkg.Fail(c, 400, "参数错误: "+err.Error())
		return
	}

	var ch model.GameChannel
	if err := model.DB.First(&ch, req.ChannelID).Error; err != nil {
		pkg.Fail(c, 400, "指定渠道不存在")
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
			if name == "" {
				continue
			}
			items = append(items, BatchImportItem{
				AccountName: name,
				Password:    pwd,
				GameName:    ch.Name,
			})
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
			ChannelID:   req.ChannelID,
			AccountName: item.AccountName,
			Password:    item.Password,
			GameName:    gameName,
			AppID:       item.AppID,
			AppSecret:   item.AppSecret,
			LoginInfo:   item.LoginInfo,
			Status:      model.AccountStatusAvailable,
			Remark:      item.Remark,
		}
		if err := model.DB.Create(&account).Error; err == nil {
			created++
		}
	}

	pkg.Success(c, gin.H{
		"total":   len(items),
		"created": created,
	})
	recordOperationLog(c, "account.batch_import", "game_account", req.ChannelID, gin.H{"total": len(items), "created": created})
}
