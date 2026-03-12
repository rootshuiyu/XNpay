package handler

import (
	"encoding/csv"
	"fmt"
	"strconv"
	"time"
	"xinipay/internal/model"
	"xinipay/pkg"

	"github.com/gin-gonic/gin"
)

func GetOrders(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "10"))
	orderNo := c.Query("order_no")
	status := c.Query("status")
	channelID := c.Query("channel_id")
	startDate := c.Query("start_date")
	endDate := c.Query("end_date")

	query := model.DB.Model(&model.PaymentOrder{})
	if orderNo != "" {
		query = query.Where("order_no LIKE ?", "%"+orderNo+"%")
	}
	if status != "" {
		query = query.Where("status = ?", status)
	}
	if channelID != "" {
		query = query.Where("channel_id = ?", channelID)
	}
	if startDate != "" {
		query = query.Where("created_at >= ?", startDate)
	}
	if endDate != "" {
		query = query.Where("created_at <= ?", endDate+" 23:59:59")
	}

	var total int64
	query.Count(&total)

	var orders []model.PaymentOrder
	query.Preload("Channel").Preload("Account").
		Order("id DESC").Offset((page - 1) * size).Limit(size).Find(&orders)

	pkg.SuccessWithPage(c, orders, total, page, size)
}

func GetOrderDetail(c *gin.Context) {
	id := c.Param("id")
	var order model.PaymentOrder
	if err := model.DB.Preload("Channel").Preload("Account").First(&order, id).Error; err != nil {
		pkg.Fail(c, 404, "订单不存在")
		return
	}
	pkg.Success(c, order)
}

type OrderStats struct {
	TotalCount   int64   `json:"total_count"`
	TotalAmount  float64 `json:"total_amount"`
	PaidCount    int64   `json:"paid_count"`
	PaidAmount   float64 `json:"paid_amount"`
	PendingCount int64   `json:"pending_count"`
	FailedCount  int64   `json:"failed_count"`
}

func GetOrderStats(c *gin.Context) {
	startDate := c.Query("start_date")
	endDate := c.Query("end_date")

	query := model.DB.Model(&model.PaymentOrder{})
	if startDate != "" {
		query = query.Where("created_at >= ?", startDate)
	}
	if endDate != "" {
		query = query.Where("created_at <= ?", endDate+" 23:59:59")
	}

	var stats OrderStats
	query.Count(&stats.TotalCount)
	query.Select("COALESCE(SUM(amount), 0)").Scan(&stats.TotalAmount)

	query2 := model.DB.Model(&model.PaymentOrder{})
	if startDate != "" {
		query2 = query2.Where("created_at >= ?", startDate)
	}
	if endDate != "" {
		query2 = query2.Where("created_at <= ?", endDate+" 23:59:59")
	}

	query2.Where("status = 'paid'").Count(&stats.PaidCount)
	model.DB.Model(&model.PaymentOrder{}).Where("status = 'paid'").Select("COALESCE(SUM(amount), 0)").Scan(&stats.PaidAmount)
	model.DB.Model(&model.PaymentOrder{}).Where("status = 'pending'").Count(&stats.PendingCount)
	model.DB.Model(&model.PaymentOrder{}).Where("status = 'failed'").Count(&stats.FailedCount)

	pkg.Success(c, stats)
}

func ExportOrders(c *gin.Context) {
	status := c.Query("status")
	startDate := c.Query("start_date")
	endDate := c.Query("end_date")

	query := model.DB.Model(&model.PaymentOrder{}).Preload("Channel").Preload("Account")
	if status != "" {
		query = query.Where("status = ?", status)
	}
	if startDate != "" {
		query = query.Where("created_at >= ?", startDate)
	}
	if endDate != "" {
		query = query.Where("created_at <= ?", endDate+" 23:59:59")
	}

	var orders []model.PaymentOrder
	query.Order("id DESC").Find(&orders)

	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=orders_%s.csv", time.Now().Format("20060102150405")))
	c.Writer.Write([]byte{0xEF, 0xBB, 0xBF})

	writer := csv.NewWriter(c.Writer)
	writer.Write([]string{"订单号", "渠道", "账号", "金额", "实付金额", "状态", "创建时间"})

	for _, o := range orders {
		channelName := ""
		if o.Channel != nil {
			channelName = o.Channel.Name
		}
		accountName := ""
		if o.Account != nil {
			accountName = o.Account.AccountName
		}
		paidAt := ""
		if o.PaidAt != nil {
			paidAt = o.PaidAt.Format("2006-01-02 15:04:05")
		}
		_ = paidAt
		writer.Write([]string{
			o.OrderNo,
			channelName,
			accountName,
			fmt.Sprintf("%.2f", o.Amount),
			fmt.Sprintf("%.2f", o.ActualAmount),
			o.Status,
			o.CreatedAt.Format("2006-01-02 15:04:05"),
		})
	}
	writer.Flush()
}
