package handler

import (
	"strconv"
	"xinipay/internal/model"
	"xinipay/pkg"

	"github.com/gin-gonic/gin"
)

func GetCommissions(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "10"))
	startDate := c.Query("start_date")
	endDate := c.Query("end_date")

	query := model.DB.Model(&model.CommissionRecord{})
	if startDate != "" {
		query = query.Where("created_at >= ?", startDate)
	}
	if endDate != "" {
		query = query.Where("created_at <= ?", endDate+" 23:59:59")
	}

	var total int64
	query.Count(&total)

	var records []model.CommissionRecord
	query.Preload("Order").Preload("Admin").
		Order("id DESC").Offset((page - 1) * size).Limit(size).Find(&records)

	pkg.SuccessWithPage(c, records, total, page, size)
}

type CommissionStats struct {
	TotalAmount float64 `json:"total_amount"`
	TotalCount  int64   `json:"total_count"`
	AvgRate     float64 `json:"avg_rate"`
}

func GetCommissionStats(c *gin.Context) {
	var stats CommissionStats
	model.DB.Model(&model.CommissionRecord{}).Count(&stats.TotalCount)
	model.DB.Model(&model.CommissionRecord{}).Select("COALESCE(SUM(commission_amount), 0)").Scan(&stats.TotalAmount)
	model.DB.Model(&model.CommissionRecord{}).Select("COALESCE(AVG(commission_rate), 0)").Scan(&stats.AvgRate)
	pkg.Success(c, stats)
}

type UpdateRateRequest struct {
	ChannelID uint    `json:"channel_id" binding:"required"`
	FeeRate   float64 `json:"fee_rate"`
}

func UpdateCommissionRate(c *gin.Context) {
	var req UpdateRateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		pkg.Fail(c, 400, "参数错误")
		return
	}

	result := model.DB.Model(&model.GameChannel{}).Where("id = ?", req.ChannelID).Update("fee_rate", req.FeeRate)
	if result.RowsAffected == 0 {
		pkg.Fail(c, 404, "渠道不存在")
		return
	}
	pkg.Success(c, nil)
}
