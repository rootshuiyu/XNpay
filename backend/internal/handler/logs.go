package handler

import (
	"strconv"

	"xinipay/internal/model"
	"xinipay/pkg"

	"github.com/gin-gonic/gin"
)

func GetOperationLogs(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "20"))
	action := c.Query("action")
	actorType := c.Query("actor_type")

	query := model.DB.Model(&model.OperationLog{})
	if action != "" {
		query = query.Where("action LIKE ?", "%"+action+"%")
	}
	if actorType != "" {
		query = query.Where("actor_type = ?", actorType)
	}

	var total int64
	query.Count(&total)

	var logs []model.OperationLog
	query.Order("id DESC").Offset((page - 1) * size).Limit(size).Find(&logs)
	pkg.SuccessWithPage(c, logs, total, page, size)
}

func GetLoginLogs(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "20"))
	actorType := c.Query("actor_type")
	success := c.Query("success")

	query := model.DB.Model(&model.LoginLog{})
	if actorType != "" {
		query = query.Where("actor_type = ?", actorType)
	}
	if success != "" {
		query = query.Where("success = ?", success == "true")
	}

	var total int64
	query.Count(&total)

	var logs []model.LoginLog
	query.Order("id DESC").Offset((page - 1) * size).Limit(size).Find(&logs)
	pkg.SuccessWithPage(c, logs, total, page, size)
}
