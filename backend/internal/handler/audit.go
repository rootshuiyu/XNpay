package handler

import (
	"encoding/json"
	"fmt"

	"xinipay/internal/model"

	"github.com/gin-gonic/gin"
)

func recordOperationLog(c *gin.Context, action, resource string, resourceID interface{}, detail interface{}) {
	if c == nil {
		return
	}

	var actorID uint
	if value, ok := c.Get("user_id"); ok {
		if id, okCast := value.(uint); okCast {
			actorID = id
		}
	}

	actorType := "admin"
	if value, ok := c.Get("role"); ok {
		if role, okCast := value.(string); okCast && role != "" {
			actorType = role
		}
	}

	actorName := ""
	if value, ok := c.Get("username"); ok {
		if username, okCast := value.(string); okCast {
			actorName = username
		}
	}

	detailText := ""
	if detail != nil {
		if raw, err := json.Marshal(detail); err == nil {
			detailText = string(raw)
		}
	}

	model.DB.Create(&model.OperationLog{
		ActorType:  actorType,
		ActorID:    actorID,
		ActorName:  actorName,
		Action:     action,
		Resource:   resource,
		ResourceID: fmt.Sprint(resourceID),
		Detail:     detailText,
		IP:         c.ClientIP(),
		UserAgent:  c.Request.UserAgent(),
	})
}

func recordLoginLog(c *gin.Context, actorType string, actorID uint, username string, success bool, reason string) {
	if c == nil {
		return
	}

	model.DB.Create(&model.LoginLog{
		ActorType: actorType,
		ActorID:   actorID,
		Username:  username,
		Success:   success,
		Reason:    reason,
		IP:        c.ClientIP(),
		UserAgent: c.Request.UserAgent(),
	})
}
