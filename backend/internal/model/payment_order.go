package model

import "time"

type PaymentOrder struct {
	ID         uint         `gorm:"primaryKey" json:"id"`
	MerchantID uint         `gorm:"index;default:0" json:"merchant_id"`
	OrderNo    string       `gorm:"size:64;uniqueIndex;not null" json:"order_no"`
	OutTradeNo     string       `gorm:"size:64;index" json:"out_trade_no"`
	AccountID      uint         `gorm:"index;not null" json:"account_id"`
	ChannelID      uint         `gorm:"index;not null" json:"channel_id"`
	Amount         float64      `gorm:"type:decimal(12,2);not null" json:"amount"`
	ActualAmount   float64      `gorm:"type:decimal(12,2);default:0" json:"actual_amount"`
	Subject        string       `gorm:"size:255" json:"subject"`
	Status         string       `gorm:"size:20;default:'pending'" json:"status"`
	NotifyURL      string       `gorm:"size:500" json:"notify_url"`
	ReturnURL      string       `gorm:"size:500" json:"return_url"`
	ChannelTradeNo string       `gorm:"size:128" json:"channel_trade_no"`
	PayerInfo      string       `gorm:"type:text" json:"payer_info"`
	NotifyStatus   string       `gorm:"size:20;default:'pending'" json:"notify_status"`
	NotifyCount    int          `gorm:"default:0" json:"notify_count"`
	PayMethod      string       `gorm:"size:20" json:"pay_method"`
	QrCode         string       `gorm:"size:500" json:"qr_code"`
	PayURL         string       `gorm:"size:500" json:"pay_url"`
	ClientIP       string       `gorm:"size:64;default:''" json:"client_ip"`
	BotStatus      string       `gorm:"size:20;default:''" json:"bot_status"`
	GameOrderID    string       `gorm:"size:64" json:"game_order_id"`
	GameOrderSN    string       `gorm:"size:64" json:"game_order_sn"`
	GamePlatform   string       `gorm:"size:50" json:"game_platform"`
	ExpireAt       *time.Time   `json:"expire_at"`
	ClosedAt       *time.Time   `json:"closed_at"`
	PaidAt         *time.Time   `json:"paid_at"`
	CreatedAt      time.Time    `json:"created_at"`
	UpdatedAt      time.Time    `json:"updated_at"`
	Account        *GameAccount `gorm:"foreignKey:AccountID" json:"account,omitempty"`
	Channel        *GameChannel `gorm:"foreignKey:ChannelID" json:"channel,omitempty"`
}
