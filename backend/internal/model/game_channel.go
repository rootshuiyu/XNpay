package model

import "time"

type GameChannel struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	MerchantID uint      `gorm:"index;default:0" json:"merchant_id"`
	Name       string    `gorm:"size:100;not null" json:"name"`
	ChannelCode string    `gorm:"size:50;uniqueIndex;not null" json:"channel_code"`
	PaymentType string    `gorm:"size:50;not null" json:"payment_type"`
	GameIcon    string    `gorm:"size:500" json:"game_icon"`
	MinAmount   float64   `gorm:"type:decimal(12,2);default:0" json:"min_amount"`
	MaxAmount   float64   `gorm:"type:decimal(12,2);default:0" json:"max_amount"`
	Description string    `gorm:"size:500" json:"description"`
	FeeRate     float64   `gorm:"type:decimal(5,4);default:0" json:"fee_rate"`
	Status      int       `gorm:"default:1" json:"status"`
	ConfigJSON  string    `gorm:"type:text" json:"config_json"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}
