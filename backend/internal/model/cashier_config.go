package model

import "time"

type CashierConfig struct {
	ID          uint         `gorm:"primaryKey" json:"id"`
	CashierName string       `gorm:"size:100;not null" json:"cashier_name"`
	CashierURL  string       `gorm:"size:500" json:"cashier_url"`
	AccountID   uint         `gorm:"index" json:"account_id"`
	Template    string       `gorm:"size:50;default:'default'" json:"template"`
	Status      int          `gorm:"default:1" json:"status"`
	CreatedAt   time.Time    `json:"created_at"`
	UpdatedAt   time.Time    `json:"updated_at"`
	Account     *GameAccount `gorm:"foreignKey:AccountID" json:"account,omitempty"`
}
