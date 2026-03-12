package model

import "time"

type PaymentLink struct {
	ID           uint       `gorm:"primaryKey" json:"id"`
	LinkCode     string     `gorm:"uniqueIndex;size:32" json:"link_code"`
	MerchantID   uint       `gorm:"index" json:"merchant_id"`
	ChannelID    uint       `gorm:"index" json:"channel_id"`
	Title        string     `gorm:"size:100" json:"title"`
	MinAmount    float64    `gorm:"default:10" json:"min_amount"`
	MaxAmount    float64    `gorm:"default:3000" json:"max_amount"`
	QuickAmounts string     `gorm:"type:text;default:'[100,200,300,500,1000]'" json:"quick_amounts"`
	NotifyURL    string     `gorm:"size:500" json:"notify_url"`
	ReturnURL    string     `gorm:"size:500" json:"return_url"`
	Status       int        `gorm:"default:1" json:"status"`
	ExpireAt     *time.Time `json:"expire_at"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`

	Channel  *GameChannel `gorm:"foreignKey:ChannelID" json:"channel,omitempty"`
	Merchant *Merchant    `gorm:"foreignKey:MerchantID" json:"merchant,omitempty"`
}
