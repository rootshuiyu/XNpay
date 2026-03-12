package middleware

import (
	"sync"
	"time"

	"xinipay/internal/model"
	"xinipay/pkg"

	"github.com/gin-gonic/gin"
)

type rateLimitBucket struct {
	Count   int
	ResetAt time.Time
}

var (
	rateLimitMu sync.Mutex
	rateLimits  = map[string]*rateLimitBucket{}
)

func PayCreateRateLimit() gin.HandlerFunc {
	return func(c *gin.Context) {
		limit := model.GetConfigInt(model.ConfigOrderCreateLimit, 30)
		windowSeconds := model.GetConfigInt(model.ConfigOrderCreateWindow, 60)
		if limit <= 0 || windowSeconds <= 0 {
			c.Next()
			return
		}

		key := c.ClientIP() + ":" + c.PostForm("channel_code") + ":" + c.Query("channel_code")
		now := time.Now()

		rateLimitMu.Lock()
		bucket, ok := rateLimits[key]
		if !ok || now.After(bucket.ResetAt) {
			bucket = &rateLimitBucket{Count: 0, ResetAt: now.Add(time.Duration(windowSeconds) * time.Second)}
			rateLimits[key] = bucket
		}
		bucket.Count++
		allowed := bucket.Count <= limit
		rateLimitMu.Unlock()

		if !allowed {
			pkg.Fail(c, 429, "下单过于频繁，请稍后再试")
			c.Abort()
			return
		}

		c.Next()
	}
}
