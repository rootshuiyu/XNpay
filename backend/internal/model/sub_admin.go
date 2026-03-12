package model

import "time"

type SubAdmin struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	ParentID     uint      `gorm:"index;not null" json:"parent_id"`
	Username     string    `gorm:"size:50;uniqueIndex;not null" json:"username"`
	PasswordHash string    `gorm:"size:255;not null" json:"-"`
	Permissions  string    `gorm:"type:text" json:"permissions"`
	Status       int       `gorm:"default:1" json:"status"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
	Parent       *Admin    `gorm:"foreignKey:ParentID" json:"parent,omitempty"`
}
