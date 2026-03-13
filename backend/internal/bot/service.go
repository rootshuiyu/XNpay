package bot

import (
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"xinipay/internal/model"
	"xinipay/internal/service"
)

type BotService struct {
	mu         sync.RWMutex
	running    atomic.Bool
	stopCh     chan struct{}
	processing sync.Map // orderID -> true
	stats      BotStats
}

type BotStats struct {
	mu                sync.RWMutex
	TotalProcessed    int64     `json:"total_processed"`
	TotalSuccess      int64     `json:"total_success"`
	TotalFailed       int64     `json:"total_failed"`
	ActiveOrders      int64     `json:"active_orders"`
	QueuedOrders      int64     `json:"queued_orders"`
	PollingOrders     int64     `json:"polling_orders"`
	StartedAt         time.Time `json:"started_at"`
	LastProcessedAt   *time.Time `json:"last_processed_at,omitempty"`
}

var Bot = &BotService{
	stopCh: make(chan struct{}),
}

func (bs *BotService) Start() {
	if bs.running.Load() {
		return
	}
	bs.running.Store(true)
	bs.stopCh = make(chan struct{})
	bs.stats.StartedAt = time.Now()

	SM.LoadFromDB()

	go bs.orderProcessor()
	go bs.paymentPoller()
	go bs.sessionHealthCheck()

	log.Println("[BOT] Service started")
}

func (bs *BotService) Stop() {
	if !bs.running.Load() {
		return
	}
	bs.running.Store(false)
	close(bs.stopCh)
	log.Println("[BOT] Service stopped")
}

func (bs *BotService) IsRunning() bool {
	return bs.running.Load()
}

func (bs *BotService) GetStats() BotStats {
	bs.stats.mu.RLock()
	defer bs.stats.mu.RUnlock()

	var queued, active, polling int64
	model.DB.Model(&model.PaymentOrder{}).Where("bot_status = ?", BotStatusQueued).Count(&queued)
	model.DB.Model(&model.PaymentOrder{}).Where("bot_status = ?", BotStatusProcessing).Count(&active)
	model.DB.Model(&model.PaymentOrder{}).Where("bot_status IN ?", []string{BotStatusQrReady, BotStatusPolling}).Count(&polling)

	return BotStats{
		TotalProcessed:  bs.stats.TotalProcessed,
		TotalSuccess:    bs.stats.TotalSuccess,
		TotalFailed:     bs.stats.TotalFailed,
		ActiveOrders:    active,
		QueuedOrders:    queued,
		PollingOrders:   polling,
		StartedAt:       bs.stats.StartedAt,
		LastProcessedAt: bs.stats.LastProcessedAt,
	}
}

func (bs *BotService) orderProcessor() {
	ticker := time.NewTicker(3 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-bs.stopCh:
			return
		case <-ticker.C:
			bs.processQueuedOrders()
		}
	}
}

func (bs *BotService) processQueuedOrders() {
	var orders []model.PaymentOrder
	model.DB.Preload("Account").Preload("Channel").
		Where("bot_status = ? AND status = ?", BotStatusQueued, "pending").
		Order("id ASC").Limit(5).Find(&orders)

	for _, order := range orders {
		if _, loaded := bs.processing.LoadOrStore(order.ID, true); loaded {
			continue
		}
		go bs.processOrder(order)
	}
}

func (bs *BotService) processOrder(order model.PaymentOrder) {
	defer bs.processing.Delete(order.ID)

	model.DB.Model(&order).Update("bot_status", BotStatusProcessing)

	bs.stats.mu.Lock()
	bs.stats.TotalProcessed++
	now := time.Now()
	bs.stats.LastProcessedAt = &now
	bs.stats.mu.Unlock()

	if order.Account == nil {
		bs.failOrder(order.ID, "未分配游戏账号")
		return
	}

	platform := GetPlatform(order.Account.Platform)
	if platform == nil {
		platform = GetPlatform("changyou")
	}
	if platform == nil {
		bs.failOrder(order.ID, "未找到平台适配器")
		return
	}

	gameOrder, err := platform.CreateOrder(order.Account, order.Amount, order.ClientIP)
	if err != nil {
		bs.failOrder(order.ID, fmt.Sprintf("创建游戏订单失败: %v", err))
		return
	}

	model.DB.Model(&order).Updates(map[string]interface{}{
		"game_order_id": gameOrder.OrderID,
		"game_order_sn": gameOrder.SerialNo,
		"game_platform": platform.Name(),
	})

	qrResult, err := platform.GetQRCode(gameOrder)
	if err != nil {
		bs.failOrder(order.ID, fmt.Sprintf("获取二维码失败: %v", err))
		return
	}

	// 拆分：图片URL|||H5表单JSON（含 action + fields）
	qrImageURL := qrResult
	payURL := ""
	if parts := strings.SplitN(qrResult, "|||", 2); len(parts) == 2 {
		qrImageURL = parts[0]
		payURL = parts[1]
	}

	formDataJSON, _ := json.Marshal(gameOrder.FormData)

	model.DB.Model(&order).Updates(map[string]interface{}{
		"qr_code":    qrImageURL,
		"pay_url":    payURL,
		"bot_status": BotStatusQrReady,
		"pay_method": "alipay_qr",
		"payer_info": string(formDataJSON),
	})

	bs.stats.mu.Lock()
	bs.stats.TotalSuccess++
	bs.stats.mu.Unlock()

	log.Printf("[BOT] Order %s QR ready: %s", order.OrderNo, qrImageURL)
}

func (bs *BotService) paymentPoller() {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-bs.stopCh:
			return
		case <-ticker.C:
			bs.pollPendingPayments()
		}
	}
}

func (bs *BotService) pollPendingPayments() {
	var orders []model.PaymentOrder
	model.DB.Preload("Account").
		Where("bot_status IN ? AND status = ?",
			[]string{BotStatusQrReady, BotStatusPolling}, "pending").
		Order("id ASC").Limit(10).Find(&orders)

	for _, order := range orders {
		if order.ExpireAt != nil && time.Now().After(*order.ExpireAt) {
			model.DB.Model(&order).Updates(map[string]interface{}{
				"bot_status": BotStatusFailed,
				"status":     "expired",
			})
			if order.AccountID > 0 {
				service.ReleaseAccount(order.AccountID)
				setCooldown(order.AccountID, 2*time.Minute)
			}
			continue
		}

		go bs.checkPayment(order)
	}
}

func (bs *BotService) checkPayment(order model.PaymentOrder) {
	if order.Account == nil {
		return
	}

	platform := GetPlatform(order.GamePlatform)
	if platform == nil {
		platform = GetPlatform("changyou")
	}
	if platform == nil {
		return
	}

	var formData map[string]string
	if order.PayerInfo != "" {
		json.Unmarshal([]byte(order.PayerInfo), &formData)
	}

	gameOrder := &GameOrder{
		OrderID:  order.GameOrderID,
		SerialNo: order.GameOrderSN,
		Amount:   order.Amount,
		FormData: formData,
	}

	model.DB.Model(&order).Update("bot_status", BotStatusPolling)

	status, err := platform.CheckPayStatus(order.Account, gameOrder)
	if err != nil {
		log.Printf("[BOT] Payment check error for %s: %v", order.OrderNo, err)
		return
	}

	if status.Paid {
		now := time.Now()
		actualAmount := order.Amount
		var feeRate float64
		var channel model.GameChannel
		if err := model.DB.First(&channel, order.ChannelID).Error; err == nil && channel.FeeRate > 0 {
			feeRate = channel.FeeRate
			actualAmount = order.Amount * (1 - feeRate)
		}

		model.DB.Model(&order).Updates(map[string]interface{}{
			"status":        "paid",
			"bot_status":    BotStatusCompleted,
			"actual_amount": actualAmount,
			"paid_at":       &now,
		})

		if order.AccountID > 0 {
			service.ConsumeAccount(order.AccountID)
			setCooldown(order.AccountID, 5*time.Minute)
		}

		if feeRate > 0 {
			commission := model.CommissionRecord{
				OrderID:          order.ID,
				AdminID:          1,
				CommissionRate:   feeRate,
				CommissionAmount: order.Amount * feeRate,
				Remark:           "自动抽佣(Bot)",
			}
			model.DB.Create(&commission)
		}

		go notifyMerchantForBot(order.ID)

		log.Printf("[BOT] Order %s payment confirmed! Amount: %.2f", order.OrderNo, order.Amount)
	}
}

func (bs *BotService) sessionHealthCheck() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-bs.stopCh:
			return
		case <-ticker.C:
			if ProxyPool.IsEnabled() {
				ProxyPool.HealthCheck()
			}
		}
	}
}

func (bs *BotService) failOrder(orderID uint, reason string) {
	model.DB.Model(&model.PaymentOrder{}).Where("id = ?", orderID).Updates(map[string]interface{}{
		"bot_status": BotStatusFailed,
		"payer_info": reason,
	})

	var order model.PaymentOrder
	if err := model.DB.First(&order, orderID).Error; err == nil && order.AccountID > 0 {
		service.ReleaseAccount(order.AccountID)
		setCooldown(order.AccountID, 1*time.Minute)
	}

	bs.stats.mu.Lock()
	bs.stats.TotalFailed++
	bs.stats.mu.Unlock()

	log.Printf("[BOT] Order %d failed: %s", orderID, reason)
}

func setCooldown(accountID uint, d time.Duration) {
	t := time.Now().Add(d)
	model.DB.Model(&model.GameAccount{}).Where("id = ?", accountID).
		Update("cooldown_at", &t)
}

func randomDelay(minMs, maxMs int) time.Duration {
	delta := maxMs - minMs
	if delta <= 0 {
		return time.Duration(minMs) * time.Millisecond
	}
	r := time.Now().UnixNano() % int64(delta)
	return time.Duration(int64(minMs)+r) * time.Millisecond
}

func notifyMerchantForBot(orderID uint) {
	// Calls the existing NotifyMerchant via the handler package
	// This is done through DB status change; the automation poller will pick it up
	model.DB.Model(&model.PaymentOrder{}).Where("id = ?", orderID).
		Update("notify_status", "pending")
}
