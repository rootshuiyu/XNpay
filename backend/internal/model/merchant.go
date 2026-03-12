package model

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"time"
)

type Merchant struct {
	ID            uint      `gorm:"primaryKey" json:"id"`
	ParentID      *uint     `gorm:"index" json:"parent_id"`
	Username      string    `gorm:"size:50;uniqueIndex;not null" json:"username"`
	PasswordHash  string    `gorm:"size:255;not null" json:"-"`
	Nickname      string    `gorm:"size:100" json:"nickname"`
	InviteCode    string    `gorm:"size:32;uniqueIndex;not null" json:"invite_code"`
	FeeRate       float64   `gorm:"type:decimal(5,4);default:0" json:"fee_rate"`
	Balance       float64   `gorm:"type:decimal(12,2);default:0" json:"balance"`
	FrozenBalance float64   `gorm:"type:decimal(12,2);default:0" json:"frozen_balance"`
	Level         int       `gorm:"default:1" json:"level"`
	Path          string    `gorm:"size:500;index" json:"path"`
	Status        int       `gorm:"default:1" json:"status"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
	Parent        *Merchant `gorm:"foreignKey:ParentID" json:"parent,omitempty"`
}

func GenerateInviteCode() string {
	b := make([]byte, 8)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func (m *Merchant) BuildPath() {
	if m.ParentID == nil {
		m.Path = fmt.Sprintf("%d", m.ID)
		m.Level = 1
	} else {
		var parent Merchant
		if err := DB.First(&parent, *m.ParentID).Error; err == nil {
			m.Path = fmt.Sprintf("%s/%d", parent.Path, m.ID)
			m.Level = parent.Level + 1
		}
	}
}
