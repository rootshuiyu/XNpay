package model

import "time"

type CommissionRecord struct {
	ID               uint          `gorm:"primaryKey" json:"id"`
	OrderID          uint          `gorm:"index;not null" json:"order_id"`
	AdminID          uint          `gorm:"index;not null" json:"admin_id"`
	CommissionRate   float64       `gorm:"type:decimal(5,4);not null" json:"commission_rate"`
	CommissionAmount float64       `gorm:"type:decimal(12,2);not null" json:"commission_amount"`
	Remark           string        `gorm:"size:255" json:"remark"`
	CreatedAt        time.Time     `json:"created_at"`
	Order            *PaymentOrder `gorm:"foreignKey:OrderID" json:"order,omitempty"`
	Admin            *Admin        `gorm:"foreignKey:AdminID" json:"admin,omitempty"`
}
