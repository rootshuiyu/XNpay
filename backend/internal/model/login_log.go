package model

import "time"

type LoginLog struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	ActorType  string    `gorm:"size:20;index" json:"actor_type"`
	ActorID    uint      `gorm:"index" json:"actor_id"`
	Username   string    `gorm:"size:100;index" json:"username"`
	Success    bool      `gorm:"index" json:"success"`
	Reason     string    `gorm:"size:255" json:"reason"`
	IP         string    `gorm:"size:64" json:"ip"`
	UserAgent  string    `gorm:"size:500" json:"user_agent"`
	CreatedAt  time.Time `json:"created_at"`
}
