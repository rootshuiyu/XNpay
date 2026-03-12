package service

import (
	"errors"
	"time"

	"xinipay/internal/model"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var (
	ErrNoAvailableAccount = errors.New("no available account for this channel")
	ErrAccountNotFound    = errors.New("account not found")
)

func AssignAccount(channelID uint, orderID uint) (*model.GameAccount, error) {
	var account model.GameAccount

	err := model.DB.Transaction(func(tx *gorm.DB) error {
		result := tx.Clauses(clause.Locking{Strength: "UPDATE", Options: "SKIP LOCKED"}).
			Where("channel_id = ? AND status = ?", channelID, model.AccountStatusAvailable).
			Order("id ASC").
			First(&account)
		if result.Error != nil {
			if errors.Is(result.Error, gorm.ErrRecordNotFound) {
				return ErrNoAvailableAccount
			}
			return result.Error
		}

		now := time.Now()
		account.Status = model.AccountStatusInUse
		account.OrderID = &orderID
		account.LockedAt = &now

		return tx.Save(&account).Error
	})

	if err != nil {
		return nil, err
	}
	return &account, nil
}

func ReleaseAccount(accountID uint) error {
	return model.DB.Transaction(func(tx *gorm.DB) error {
		var account model.GameAccount
		if err := tx.First(&account, accountID).Error; err != nil {
			return ErrAccountNotFound
		}
		if account.Status != model.AccountStatusInUse {
			return nil
		}

		account.Status = model.AccountStatusAvailable
		account.OrderID = nil
		account.LockedAt = nil
		return tx.Save(&account).Error
	})
}

func ConsumeAccount(accountID uint) error {
	return model.DB.Transaction(func(tx *gorm.DB) error {
		var account model.GameAccount
		if err := tx.First(&account, accountID).Error; err != nil {
			return ErrAccountNotFound
		}
		if account.Status != model.AccountStatusInUse {
			return nil
		}

		now := time.Now()
		account.Status = model.AccountStatusUsed
		account.UsedAt = &now
		return tx.Save(&account).Error
	})
}

func AutoReleaseExpired(timeout time.Duration) (int64, error) {
	cutoff := time.Now().Add(-timeout)
	result := model.DB.Model(&model.GameAccount{}).
		Where("status = ? AND locked_at < ?", model.AccountStatusInUse, cutoff).
		Updates(map[string]interface{}{
			"status":    model.AccountStatusAvailable,
			"order_id":  nil,
			"locked_at": nil,
		})
	return result.RowsAffected, result.Error
}
