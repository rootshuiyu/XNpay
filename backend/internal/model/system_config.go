package model

import (
	"strconv"
	"time"
)

const (
	ConfigSiteName              = "site_name"
	ConfigSiteLogo              = "site_logo"
	ConfigSiteFooter            = "site_footer"
	ConfigNotifyEmail           = "notify_email"
	ConfigNotifyWebhook         = "notify_webhook"
	ConfigLoginMaxAttempts      = "login_max_attempts"
	ConfigSessionTimeout        = "session_timeout"
	ConfigOrderCreateLimit      = "order_create_limit"
	ConfigOrderCreateWindow     = "order_create_window_seconds"
	ConfigOrderTimeoutMinutes   = "order_timeout_minutes"
	ConfigAutoReleaseEnabled    = "auto_release_enabled"
	ConfigAutoNotifyEnabled     = "auto_notify_enabled"
	ConfigMaintenanceNotice     = "maintenance_notice"
	ConfigAutoTaskInterval      = "auto_task_interval_seconds"
)

type SystemConfig struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	ConfigKey   string    `gorm:"size:100;uniqueIndex;not null" json:"config_key"`
	ConfigValue string    `gorm:"type:text" json:"config_value"`
	Description string    `gorm:"size:255" json:"description"`
	UpdatedAt   time.Time `json:"updated_at"`
}

func DefaultSystemConfigs() []SystemConfig {
	return []SystemConfig{
		{ConfigKey: ConfigSiteName, ConfigValue: "犀牛支付", Description: "站点名称"},
		{ConfigKey: ConfigSiteLogo, ConfigValue: "/rhino-logo.png", Description: "站点 Logo"},
		{ConfigKey: ConfigSiteFooter, ConfigValue: "版权所有 © 2026 犀牛支付", Description: "页脚文案"},
		{ConfigKey: ConfigNotifyEmail, ConfigValue: "", Description: "通知邮箱"},
		{ConfigKey: ConfigNotifyWebhook, ConfigValue: "", Description: "Webhook 地址"},
		{ConfigKey: ConfigLoginMaxAttempts, ConfigValue: "5", Description: "最大登录尝试次数"},
		{ConfigKey: ConfigSessionTimeout, ConfigValue: "60", Description: "会话超时时间（分钟）"},
		{ConfigKey: ConfigOrderCreateLimit, ConfigValue: "30", Description: "下单限流次数（窗口内）"},
		{ConfigKey: ConfigOrderCreateWindow, ConfigValue: "60", Description: "下单限流窗口（秒）"},
		{ConfigKey: ConfigOrderTimeoutMinutes, ConfigValue: "30", Description: "订单超时关闭分钟数"},
		{ConfigKey: ConfigAutoReleaseEnabled, ConfigValue: "true", Description: "是否启用自动释放账号"},
		{ConfigKey: ConfigAutoNotifyEnabled, ConfigValue: "true", Description: "是否启用自动补回调"},
		{ConfigKey: ConfigMaintenanceNotice, ConfigValue: "当前通道维护中，请稍后再试", Description: "默认维护提示文案"},
		{ConfigKey: ConfigAutoTaskInterval, ConfigValue: "60", Description: "自动任务执行间隔（秒）"},
	}
}

func GetDefaultConfigDescription(key string) string {
	for _, item := range DefaultSystemConfigs() {
		if item.ConfigKey == key {
			return item.Description
		}
	}
	return ""
}

func EnsureDefaultConfigs() {
	for _, cfg := range DefaultSystemConfigs() {
		var existing SystemConfig
		if err := DB.Where("config_key = ?", cfg.ConfigKey).First(&existing).Error; err != nil {
			DB.Create(&cfg)
		}
	}
}

func GetConfigValue(key, fallback string) string {
	var cfg SystemConfig
	if err := DB.Where("config_key = ?", key).First(&cfg).Error; err != nil || cfg.ConfigValue == "" {
		return fallback
	}
	return cfg.ConfigValue
}

func GetConfigInt(key string, fallback int) int {
	value := GetConfigValue(key, "")
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func GetConfigBool(key string, fallback bool) bool {
	value := GetConfigValue(key, "")
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return fallback
	}
	return parsed
}
