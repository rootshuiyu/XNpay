package model

import "time"

const (
	AccountStatusAvailable = "available"
	AccountStatusInUse     = "in_use"
	AccountStatusUsed      = "used"
	AccountStatusDisabled  = "disabled"
)

type GameAccount struct {
	ID         uint         `gorm:"primaryKey" json:"id"`
	MerchantID uint         `gorm:"index;default:0" json:"merchant_id"`
	ChannelID  uint         `gorm:"index;not null" json:"channel_id"`
	AccountName string       `gorm:"size:100;not null" json:"account_name"`
	Password    string       `gorm:"size:255" json:"password"`
	GameName    string       `gorm:"size:100;not null" json:"game_name"`
	AppID       string       `gorm:"size:255" json:"app_id"`
	AppSecret   string       `gorm:"size:255" json:"app_secret"`
	LoginInfo   string       `gorm:"type:text" json:"login_info"`
	Platform    string       `gorm:"size:50;default:'changyou'" json:"platform"`
	Status      string       `gorm:"size:20;default:'available'" json:"status"`
	OrderID     *uint        `gorm:"index" json:"order_id"`
	LockedAt    *time.Time   `json:"locked_at"`
	UsedAt      *time.Time   `json:"used_at"`
	CooldownAt  *time.Time   `json:"cooldown_at"`
	Remark      string       `gorm:"size:500" json:"remark"`
	CreatedAt   time.Time    `json:"created_at"`
	UpdatedAt   time.Time    `json:"updated_at"`
	Channel     *GameChannel `gorm:"foreignKey:ChannelID" json:"channel,omitempty"`
}
