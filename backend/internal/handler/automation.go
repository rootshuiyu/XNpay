package handler

import (
	"time"

	"xinipay/internal/model"
	"xinipay/internal/service"
	"xinipay/pkg"

	"github.com/gin-gonic/gin"
)

type AutomationRunResult struct {
	ExpiredOrders int64 `json:"expired_orders"`
	ReleasedAccounts int64 `json:"released_accounts"`
	RetriedNotifications int `json:"retried_notifications"`
}

func getOrderTimeoutDuration() time.Duration {
	minutes := model.GetConfigInt(model.ConfigOrderTimeoutMinutes, 30)
	if minutes <= 0 {
		minutes = 30
	}
	return time.Duration(minutes) * time.Minute
}

func expirePendingOrders(timeout time.Duration) (int64, int64, error) {
	cutoff := time.Now().Add(-timeout)
	var orders []model.PaymentOrder
	if err := model.DB.Where("status = ? AND ((expire_at IS NOT NULL AND expire_at < ?) OR (expire_at IS NULL AND created_at < ?))", "pending", time.Now(), cutoff).Find(&orders).Error; err != nil {
		return 0, 0, err
	}

	var expiredCount int64
	var releasedCount int64
	now := time.Now()

	for _, order := range orders {
		result := model.DB.Model(&model.PaymentOrder{}).Where("id = ? AND status = ?", order.ID, "pending").Updates(map[string]interface{}{
			"status":    "expired",
			"closed_at": &now,
		})
		if result.Error == nil && result.RowsAffected > 0 {
			if order.AccountID > 0 {
				if err := service.ReleaseAccount(order.AccountID); err == nil {
					releasedCount++
				}
			}
			expiredCount++
		}
	}

	return expiredCount, releasedCount, nil
}

func retryPendingNotifications(limit int) int {
	if !model.GetConfigBool(model.ConfigAutoNotifyEnabled, true) {
		return 0
	}

	var orders []model.PaymentOrder
	model.DB.Where("status = ? AND notify_url <> '' AND notify_status IN ? AND notify_count < ?", "paid", []string{"pending", "failed"}, 6).
		Order("id ASC").Limit(limit).Find(&orders)

	count := 0
	for _, order := range orders {
		NotifyMerchant(order.ID)
		count++
	}
	return count
}

func runAutomationTasks() (AutomationRunResult, error) {
	result := AutomationRunResult{}

	if model.GetConfigBool(model.ConfigAutoReleaseEnabled, true) {
		expired, released, err := expirePendingOrders(getOrderTimeoutDuration())
		if err != nil {
			return result, err
		}
		result.ExpiredOrders = expired
		result.ReleasedAccounts = released
	}

	result.RetriedNotifications = retryPendingNotifications(20)
	return result, nil
}

func StartBackgroundJobs() {
	go func() {
		for {
			interval := model.GetConfigInt(model.ConfigAutoTaskInterval, 60)
			if interval <= 0 {
				interval = 60
			}

			_, _ = runAutomationTasks()
			time.Sleep(time.Duration(interval) * time.Second)
		}
	}()
}

func GetAutomationOverview(c *gin.Context) {
	timeout := getOrderTimeoutDuration()
	cutoff := time.Now().Add(-timeout)

	var pendingOrders int64
	var expiringOrders int64
	var lockedAccounts int64
	var failedNotify int64

	model.DB.Model(&model.PaymentOrder{}).Where("status = ?", "pending").Count(&pendingOrders)
	model.DB.Model(&model.PaymentOrder{}).Where("status = ? AND ((expire_at IS NOT NULL AND expire_at < ?) OR (expire_at IS NULL AND created_at < ?))", "pending", time.Now(), cutoff).Count(&expiringOrders)
	model.DB.Model(&model.GameAccount{}).Where("status = ? AND locked_at < ?", model.AccountStatusInUse, cutoff).Count(&lockedAccounts)
	model.DB.Model(&model.PaymentOrder{}).Where("status = ? AND notify_status = ?", "paid", "failed").Count(&failedNotify)

	pkg.Success(c, gin.H{
		"pending_orders":         pendingOrders,
		"expiring_orders":        expiringOrders,
		"locked_accounts":        lockedAccounts,
		"failed_notifications":   failedNotify,
		"order_timeout_minutes":  int(timeout.Minutes()),
		"auto_release_enabled":   model.GetConfigBool(model.ConfigAutoReleaseEnabled, true),
		"auto_notify_enabled":    model.GetConfigBool(model.ConfigAutoNotifyEnabled, true),
		"rate_limit_window":      model.GetConfigInt(model.ConfigOrderCreateWindow, 60),
		"rate_limit_threshold":   model.GetConfigInt(model.ConfigOrderCreateLimit, 30),
	})
}

func RunAutomationTasks(c *gin.Context) {
	result, err := runAutomationTasks()
	if err != nil {
		pkg.Fail(c, 500, "执行自动任务失败")
		return
	}

	recordOperationLog(c, "automation.run", "automation", "system", result)
	pkg.Success(c, result)
}

func RetryOrderNotify(c *gin.Context) {
	id := c.Param("id")

	var order model.PaymentOrder
	if err := model.DB.First(&order, id).Error; err != nil {
		pkg.Fail(c, 404, "订单不存在")
		return
	}
	if order.Status != "paid" {
		pkg.Fail(c, 400, "仅已支付订单可补发回调")
		return
	}

	NotifyMerchant(order.ID)
	recordOperationLog(c, "order.retry_notify", "payment_order", order.ID, gin.H{"order_no": order.OrderNo})
	pkg.Success(c, gin.H{"message": "已触发补回调"})
}
