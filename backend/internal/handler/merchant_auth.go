package handler

import (
	"fmt"

	"xinipay/internal/middleware"
	"xinipay/internal/model"
	"xinipay/pkg"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

type MerchantLoginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

func MerchantLogin(c *gin.Context) {
	var req MerchantLoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		recordLoginLog(c, "merchant", 0, "", false, "invalid_payload")
		pkg.Fail(c, 400, "请输入用户名和密码")
		return
	}

	var merchant model.Merchant
	if err := model.DB.Where("username = ? AND status = 1", req.Username).First(&merchant).Error; err != nil {
		recordLoginLog(c, "merchant", 0, req.Username, false, "user_not_found")
		pkg.Fail(c, 401, "用户名或密码错误")
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(merchant.PasswordHash), []byte(req.Password)); err != nil {
		recordLoginLog(c, "merchant", merchant.ID, req.Username, false, "password_mismatch")
		pkg.Fail(c, 401, "用户名或密码错误")
		return
	}

	token, err := middleware.GenerateTokenWithMerchant(merchant.ID, merchant.Username, "merchant", merchant.ID)
	if err != nil {
		pkg.Fail(c, 500, "生成令牌失败")
		return
	}

	recordLoginLog(c, "merchant", merchant.ID, merchant.Username, true, "")

	pkg.Success(c, gin.H{
		"token": token,
		"merchant_info": gin.H{
			"id":          merchant.ID,
			"username":    merchant.Username,
			"nickname":    merchant.Nickname,
			"invite_code": merchant.InviteCode,
			"fee_rate":    merchant.FeeRate,
			"balance":     merchant.Balance,
			"level":       merchant.Level,
		},
	})
}

type MerchantRegisterRequest struct {
	Username   string `json:"username" binding:"required,min=3"`
	Password   string `json:"password" binding:"required,min=6"`
	Nickname   string `json:"nickname"`
	InviteCode string `json:"invite_code" binding:"required"`
}

func MerchantRegister(c *gin.Context) {
	var req MerchantRegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		pkg.Fail(c, 400, "参数错误: "+err.Error())
		return
	}

	var parent model.Merchant
	if err := model.DB.Where("invite_code = ? AND status = 1", req.InviteCode).First(&parent).Error; err != nil {
		pkg.Fail(c, 400, "邀请码无效")
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

	merchant := model.Merchant{
		ParentID:     &parent.ID,
		Username:     req.Username,
		PasswordHash: string(hash),
		Nickname:     nickname,
		InviteCode:   model.GenerateInviteCode(),
		FeeRate:      parent.FeeRate,
		Level:        parent.Level + 1,
		Status:       1,
	}

	if err := model.DB.Create(&merchant).Error; err != nil {
		pkg.Fail(c, 500, "注册失败")
		return
	}

	merchant.Path = fmt.Sprintf("%s/%d", parent.Path, merchant.ID)
	model.DB.Save(&merchant)
	recordOperationLog(c, "merchant.register", "merchant", merchant.ID, gin.H{"username": merchant.Username, "parent_id": parent.ID})

	pkg.Success(c, gin.H{"message": "注册成功", "username": merchant.Username})
}

func MerchantGetProfile(c *gin.Context) {
	merchantID, _ := c.Get("merchant_id")

	var merchant model.Merchant
	if err := model.DB.First(&merchant, merchantID).Error; err != nil {
		pkg.Fail(c, 404, "商户不存在")
		return
	}

	pkg.Success(c, gin.H{
		"id":             merchant.ID,
		"username":       merchant.Username,
		"nickname":       merchant.Nickname,
		"invite_code":    merchant.InviteCode,
		"fee_rate":       merchant.FeeRate,
		"balance":        merchant.Balance,
		"frozen_balance": merchant.FrozenBalance,
		"level":          merchant.Level,
		"created_at":     merchant.CreatedAt,
	})
}

func MerchantChangePassword(c *gin.Context) {
	var req ChangePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		pkg.Fail(c, 400, "请输入有效的密码")
		return
	}

	merchantID, _ := c.Get("merchant_id")
	var merchant model.Merchant
	if err := model.DB.First(&merchant, merchantID).Error; err != nil {
		pkg.Fail(c, 404, "商户不存在")
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(merchant.PasswordHash), []byte(req.OldPassword)); err != nil {
		pkg.Fail(c, 400, "原密码错误")
		return
	}

	hash, _ := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	model.DB.Model(&merchant).Update("password_hash", string(hash))
	recordOperationLog(c, "merchant.change_password", "merchant", merchant.ID, gin.H{"username": merchant.Username})
	pkg.Success(c, nil)
}
