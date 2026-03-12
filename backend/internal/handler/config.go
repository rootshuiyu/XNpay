package handler

import (
	"xinipay/internal/model"
	"xinipay/pkg"

	"github.com/gin-gonic/gin"
)

func GetConfigs(c *gin.Context) {
	var configs []model.SystemConfig
	model.DB.Order("id ASC").Find(&configs)

	configMap := make(map[string]string)
	for _, cfg := range configs {
		configMap[cfg.ConfigKey] = cfg.ConfigValue
	}
	pkg.Success(c, configMap)
}

type ConfigUpdateRequest struct {
	Configs map[string]string `json:"configs" binding:"required"`
}

func UpdateConfigs(c *gin.Context) {
	var req ConfigUpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		pkg.Fail(c, 400, "参数错误")
		return
	}

	for key, value := range req.Configs {
		var existing model.SystemConfig
		result := model.DB.Where("config_key = ?", key).First(&existing)
		if result.Error != nil {
			model.DB.Create(&model.SystemConfig{
				ConfigKey:   key,
				ConfigValue: value,
			})
		} else {
			model.DB.Model(&existing).Update("config_value", value)
		}
	}

	pkg.Success(c, nil)
}
