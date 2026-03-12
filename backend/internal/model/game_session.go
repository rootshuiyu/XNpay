package model

import "time"

const (
	SessionStatusActive  = "active"
	SessionStatusExpired = "expired"
	SessionStatusFailed  = "failed"
)

type GameSession struct {
	ID          uint       `gorm:"primaryKey" json:"id"`
	AccountID   uint       `gorm:"uniqueIndex" json:"account_id"`
	Platform    string     `gorm:"size:50;index" json:"platform"`
	Cookies     string     `gorm:"type:text" json:"cookies"`
	UserAgent   string     `gorm:"size:500" json:"user_agent"`
	Status      string     `gorm:"size:20;default:'active'" json:"status"`
	ProxyAddr   string     `gorm:"size:200" json:"proxy_addr"`
	LoginAt     time.Time  `json:"login_at"`
	ExpireAt    *time.Time `json:"expire_at"`
	LastCheckAt *time.Time `json:"last_check_at"`
	ErrorMsg    string     `gorm:"size:500" json:"error_msg"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
	Account     *GameAccount `gorm:"foreignKey:AccountID" json:"account,omitempty"`
}
