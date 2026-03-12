package model

import "time"

type OperationLog struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	ActorType  string    `gorm:"size:20;index" json:"actor_type"`
	ActorID    uint      `gorm:"index" json:"actor_id"`
	ActorName  string    `gorm:"size:100;index" json:"actor_name"`
	Action     string    `gorm:"size:100;index" json:"action"`
	Resource   string    `gorm:"size:100;index" json:"resource"`
	ResourceID string    `gorm:"size:64;index" json:"resource_id"`
	Detail     string    `gorm:"type:text" json:"detail"`
	IP         string    `gorm:"size:64" json:"ip"`
	UserAgent  string    `gorm:"size:500" json:"user_agent"`
	CreatedAt  time.Time `json:"created_at"`
}
