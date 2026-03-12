package model

import (
	"fmt"
	"log"

	"xinipay/internal/config"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var DB *gorm.DB

func InitDB() {
	var logLevel logger.LogLevel
	if config.AppConfig.Server.Mode == "debug" {
		logLevel = logger.Info
	} else {
		logLevel = logger.Silent
	}

	var err error
	DB, err = gorm.Open(postgres.Open(config.AppConfig.Database.DSN()), &gorm.Config{
		Logger: logger.Default.LogMode(logLevel),
	})
	if err != nil {
		log.Fatalf("Failed to connect database: %v", err)
	}

	sqlDB, _ := DB.DB()
	sqlDB.SetMaxIdleConns(10)
	sqlDB.SetMaxOpenConns(100)

	err = DB.AutoMigrate(
		&Admin{},
		&Merchant{},
		&GameChannel{},
		&GameAccount{},
		&PaymentOrder{},
		&CommissionRecord{},
		&CashierConfig{},
		&SubAdmin{},
		&SystemConfig{},
	)
	if err != nil {
		log.Fatalf("Failed to auto migrate: %v", err)
	}

	seedAdmin()
	seedDefaultMerchant()
}

func seedDefaultMerchant() {
	var count int64
	DB.Model(&Merchant{}).Count(&count)
	if count > 0 {
		return
	}

	hash, _ := bcrypt.GenerateFromPassword([]byte("merchant123"), bcrypt.DefaultCost)
	m := Merchant{
		Username:     "merchant",
		PasswordHash: string(hash),
		Nickname:     "默认商户",
		InviteCode:   GenerateInviteCode(),
		FeeRate:      0.03,
		Level:        1,
		Status:       1,
	}
	DB.Create(&m)
	m.Path = fmt.Sprintf("%d", m.ID)
	DB.Save(&m)
	log.Println("Default merchant created: merchant / merchant123")
}

func seedAdmin() {
	var count int64
	DB.Model(&Admin{}).Count(&count)
	if count > 0 {
		return
	}

	hash, _ := bcrypt.GenerateFromPassword([]byte("admin123"), bcrypt.DefaultCost)
	admin := Admin{
		Username:     "admin",
		PasswordHash: string(hash),
		Role:         "admin",
		Status:       1,
	}
	DB.Create(&admin)
	log.Println("Default admin created: admin / admin123")
}
