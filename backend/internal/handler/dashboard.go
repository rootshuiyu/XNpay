package handler

import (
	"time"
	"xinipay/internal/model"
	"xinipay/pkg"

	"github.com/gin-gonic/gin"
)

type DashboardStats struct {
	TodayOrders    int64   `json:"today_orders"`
	TodayAmount    float64 `json:"today_amount"`
	WeekOrders     int64   `json:"week_orders"`
	WeekAmount     float64 `json:"week_amount"`
	MonthOrders    int64   `json:"month_orders"`
	MonthAmount    float64 `json:"month_amount"`
	TotalOrders    int64   `json:"total_orders"`
	TotalAmount    float64 `json:"total_amount"`
	TotalChannels  int64   `json:"total_channels"`
	TotalAccounts  int64   `json:"total_accounts"`
}

func GetDashboardStats(c *gin.Context) {
	now := time.Now()
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	weekStart := todayStart.AddDate(0, 0, -int(now.Weekday()))
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())

	var stats DashboardStats

	model.DB.Model(&model.PaymentOrder{}).Where("created_at >= ?", todayStart).Count(&stats.TodayOrders)
	model.DB.Model(&model.PaymentOrder{}).Where("created_at >= ? AND status = 'paid'", todayStart).
		Select("COALESCE(SUM(amount), 0)").Scan(&stats.TodayAmount)

	model.DB.Model(&model.PaymentOrder{}).Where("created_at >= ?", weekStart).Count(&stats.WeekOrders)
	model.DB.Model(&model.PaymentOrder{}).Where("created_at >= ? AND status = 'paid'", weekStart).
		Select("COALESCE(SUM(amount), 0)").Scan(&stats.WeekAmount)

	model.DB.Model(&model.PaymentOrder{}).Where("created_at >= ?", monthStart).Count(&stats.MonthOrders)
	model.DB.Model(&model.PaymentOrder{}).Where("created_at >= ? AND status = 'paid'", monthStart).
		Select("COALESCE(SUM(amount), 0)").Scan(&stats.MonthAmount)

	model.DB.Model(&model.PaymentOrder{}).Count(&stats.TotalOrders)
	model.DB.Model(&model.PaymentOrder{}).Where("status = 'paid'").
		Select("COALESCE(SUM(amount), 0)").Scan(&stats.TotalAmount)

	model.DB.Model(&model.GameChannel{}).Count(&stats.TotalChannels)
	model.DB.Model(&model.GameAccount{}).Count(&stats.TotalAccounts)

	pkg.Success(c, stats)
}

type ChartData struct {
	Dates   []string  `json:"dates"`
	Orders  []int64   `json:"orders"`
	Amounts []float64 `json:"amounts"`
}

func GetDashboardChart(c *gin.Context) {
	days := 7
	now := time.Now()
	var chart ChartData

	for i := days - 1; i >= 0; i-- {
		date := now.AddDate(0, 0, -i)
		dayStart := time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, date.Location())
		dayEnd := dayStart.AddDate(0, 0, 1)

		chart.Dates = append(chart.Dates, dayStart.Format("01-02"))

		var count int64
		model.DB.Model(&model.PaymentOrder{}).Where("created_at >= ? AND created_at < ?", dayStart, dayEnd).Count(&count)
		chart.Orders = append(chart.Orders, count)

		var amount float64
		model.DB.Model(&model.PaymentOrder{}).Where("created_at >= ? AND created_at < ? AND status = 'paid'", dayStart, dayEnd).
			Select("COALESCE(SUM(amount), 0)").Scan(&amount)
		chart.Amounts = append(chart.Amounts, amount)
	}

	pkg.Success(c, chart)
}

func GetRecentOrders(c *gin.Context) {
	var orders []model.PaymentOrder
	model.DB.Preload("Channel").Preload("Account").
		Order("created_at DESC").Limit(10).Find(&orders)
	pkg.Success(c, orders)
}
