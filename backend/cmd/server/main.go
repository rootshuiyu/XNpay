package main

import (
	"fmt"
	"log"

	"xinipay/internal/bot"
	"xinipay/internal/config"
	"xinipay/internal/handler"
	"xinipay/internal/license"
	"xinipay/internal/model"
	"xinipay/internal/router"
)

func main() {
	config.InitConfig()

	if !license.CheckIntegrity() {
		log.Fatalf("[SECURITY] Binary integrity check failed")
	}

	license.StartAntiDebug()

	if config.AppConfig.License.Enabled {
		licensePath := config.AppConfig.License.FilePath
		if licensePath == "" {
			licensePath = "license.enc"
		}

		ld, err := license.Validate(licensePath)
		if err != nil {
			log.Fatalf("[LICENSE] Validation failed: %v", err)
		}
		log.Printf("[LICENSE] Licensed to: %s, expires: %s, max merchants: %d",
			ld.Licensee, ld.ExpireAt.Format("2006-01-02"), ld.MaxMerchants)
	}

	model.InitDB()
	handler.StartBackgroundJobs()
	bot.Bot.Start()

	r := router.SetupRouter()

	addr := fmt.Sprintf(":%d", config.AppConfig.Server.Port)
	log.Printf("Server starting on %s", addr)
	if err := r.Run(addr); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
