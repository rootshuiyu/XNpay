package handler

import (
	"crypto/md5"
	"fmt"
	"strconv"
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
