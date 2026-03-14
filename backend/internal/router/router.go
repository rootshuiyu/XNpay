package router

import (
	"net/http"
	"os"
	"regexp"
	"strings"

	"xinipay/internal/handler"
	"xinipay/internal/middleware"
	"xinipay/internal/model"

	_ "xinipay/internal/bot"
	_ "xinipay/internal/channel"

	"github.com/gin-contrib/static"
	"github.com/gin-gonic/gin"
)

var mobileRe = regexp.MustCompile(`(?i)(android|iphone|ipad|ipod|mobile|wap)`)

func SetupRouter() *gin.Engine {
	r := gin.Default()
	r.Use(middleware.CORS())

	r.GET("/api/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	// 移动端访问收银台页面时，服务端直接 302 到 H5 唤起页
	r.GET("/cashier/:orderNo", func(c *gin.Context) {
		ua := c.Request.UserAgent()
		if mobileRe.MatchString(ua) && !strings.Contains(strings.ToLower(ua), "micromessenger") {
			orderNo := c.Param("orderNo")
			var order model.PaymentOrder
			if err := model.DB.Where("order_no = ?", orderNo).First(&order).Error; err == nil && order.PayURL != "" {
				c.Redirect(http.StatusFound, "/pay/h5/"+orderNo)
				return
			}
		}
		c.File("./static/index.html")
	})

	if _, err := os.Stat("./static"); err == nil {
		r.Use(static.Serve("/", static.LocalFile("./static", true)))
		r.NoRoute(func(c *gin.Context) {
			c.File("./static/index.html")
		})
	}

	api := r.Group("/api")
	{
		auth := api.Group("/auth")
		{
			auth.POST("/login", handler.Login)
		}

		protected := api.Group("")
		protected.Use(middleware.JWTAuth())
		{
			protected.POST("/auth/logout", handler.Logout)
			protected.GET("/auth/profile", handler.GetProfile)
			protected.PUT("/auth/password", handler.ChangePassword)

			protected.GET("/dashboard/stats", handler.GetDashboardStats)
			protected.GET("/dashboard/chart", handler.GetDashboardChart)
			protected.GET("/dashboard/recent-orders", handler.GetRecentOrders)

			channels := protected.Group("/channels")
			{
				channels.GET("/stats", handler.GetChannelStats)
				channels.GET("/cards", handler.GetChannelCardList)
				channels.GET("", handler.GetChannels)
				channels.POST("", handler.CreateChannel)
				channels.PUT("/:id", handler.UpdateChannel)
				channels.DELETE("/:id", handler.DeleteChannel)
				channels.PUT("/:id/toggle", handler.ToggleChannelStatus)
			}

			accounts := protected.Group("/accounts")
			{
				accounts.GET("", handler.GetAccounts)
				accounts.POST("", handler.CreateAccount)
				accounts.POST("/batch", handler.BatchImportAccounts)
				accounts.PUT("/:id", handler.UpdateAccount)
				accounts.DELETE("/:id", handler.DeleteAccount)
			}

			orders := protected.Group("/orders")
			{
				orders.GET("", handler.GetOrders)
				orders.GET("/stats", handler.GetOrderStats)
				orders.GET("/export", handler.ExportOrders)
				orders.POST("/:id/retry-notify", handler.RetryOrderNotify)
				orders.GET("/:id", handler.GetOrderDetail)
			}

			commissions := protected.Group("/commissions")
			{
				commissions.GET("", handler.GetCommissions)
				commissions.GET("/stats", handler.GetCommissionStats)
				commissions.PUT("/rate", handler.UpdateCommissionRate)
			}

			cashiers := protected.Group("/cashiers")
			{
				cashiers.GET("", handler.GetCashiers)
				cashiers.POST("", handler.CreateCashier)
				cashiers.PUT("/:id", handler.UpdateCashier)
				cashiers.DELETE("/:id", handler.DeleteCashier)
			}

			subAdmins := protected.Group("/sub-admins")
			subAdmins.Use(middleware.AdminOnly())
			{
				subAdmins.GET("", handler.GetSubAdmins)
				subAdmins.POST("", handler.CreateSubAdmin)
				subAdmins.PUT("/:id", handler.UpdateSubAdmin)
				subAdmins.DELETE("/:id", handler.DeleteSubAdmin)
			}

		configs := protected.Group("/configs")
		subAdmins.Use(middleware.AdminOnly())
		{
			configs.GET("", handler.GetConfigs)
			configs.PUT("", handler.UpdateConfigs)
		}

		logs := protected.Group("/logs")
		logs.Use(middleware.AdminOnly())
		{
			logs.GET("/operations", handler.GetOperationLogs)
			logs.GET("/logins", handler.GetLoginLogs)
		}

		automation := protected.Group("/automation")
		automation.Use(middleware.AdminOnly())
		{
			automation.GET("/overview", handler.GetAutomationOverview)
			automation.POST("/run", handler.RunAutomationTasks)
		}

		botAPI := protected.Group("/bot")
		botAPI.Use(middleware.AdminOnly())
		{
			botAPI.GET("/status", handler.BotGetStatus)
			botAPI.POST("/toggle", handler.BotToggle)
			botAPI.GET("/sessions", handler.BotGetSessions)
			botAPI.DELETE("/sessions/:id", handler.BotClearSession)
			botAPI.GET("/proxies", handler.BotGetProxies)
			botAPI.POST("/proxies", handler.BotAddProxy)
			botAPI.DELETE("/proxies", handler.BotRemoveProxy)
			botAPI.POST("/proxies/toggle", handler.BotToggleProxy)
			botAPI.POST("/proxies/health-check", handler.BotHealthCheck)
			botAPI.POST("/orders/:id/retry", handler.BotRetryOrder)
			botAPI.GET("/orders", handler.BotGetOrderBot)
			botAPI.GET("/qr-proxy", handler.BotGetQRProxy)
		}

		payLinks := protected.Group("/pay-links")
		{
			payLinks.GET("", handler.AdminGetPayLinks)
			payLinks.POST("", handler.AdminCreatePayLink)
			payLinks.PUT("/:id", handler.AdminUpdatePayLink)
			payLinks.DELETE("/:id", handler.AdminDeletePayLink)
			payLinks.PUT("/:id/toggle", handler.AdminTogglePayLink)
		}

		merchants := protected.Group("/merchants")
		merchants.Use(middleware.AdminOnly())
		{
			merchants.GET("", handler.AdminGetMerchants)
			merchants.POST("", handler.AdminCreateMerchant)
			merchants.GET("/tree", handler.AdminGetMerchantTree)
			merchants.GET("/:id", handler.AdminGetMerchantDetail)
			merchants.PUT("/:id", handler.AdminUpdateMerchant)
			merchants.PUT("/:id/status", handler.AdminToggleMerchantStatus)
			merchants.GET("/:id/stats", handler.AdminGetMerchantStats)
		}
	}

	api.GET("/ws/notifications", handler.WSHandler)
}

merchantAuth := r.Group("/merchant/auth")
{
	merchantAuth.POST("/login", handler.MerchantLogin)
	merchantAuth.POST("/register", handler.MerchantRegister)
}

merchant := r.Group("/merchant")
merchant.Use(middleware.MerchantAuth())
{
	merchant.GET("/profile", handler.MerchantGetProfile)
	merchant.PUT("/password", handler.MerchantChangePassword)
	merchant.GET("/dashboard", handler.MerchantDashboard)
	merchant.GET("/channels", handler.MerchantGetChannels)
	merchant.POST("/channels", handler.MerchantCreateChannel)
	merchant.GET("/channels/cards", handler.MerchantGetChannelCards)
	merchant.GET("/accounts", handler.MerchantGetAccounts)
	merchant.POST("/accounts", handler.MerchantCreateAccount)
	merchant.POST("/accounts/batch", handler.MerchantBatchImport)
	merchant.GET("/orders", handler.MerchantGetOrders)
		merchant.GET("/orders/export", handler.MerchantExportOrders)
	merchant.GET("/sub-merchants", handler.MerchantGetSubMerchants)
	merchant.POST("/sub-merchants", handler.MerchantCreateSub)
	merchant.PUT("/sub-merchants/:id/rate", handler.MerchantSetSubRate)
	merchant.GET("/invite-code", handler.MerchantGetInviteCode)
	merchant.POST("/invite-code/refresh", handler.MerchantRefreshInviteCode)
	merchant.GET("/balance", handler.MerchantGetBalance)
}

	pay := r.Group("/pay")
	{
		pay.POST("/create", middleware.PayCreateRateLimit(), handler.PayCreateOrder)
		pay.GET("/query", handler.PayQueryOrder)

		pay.GET("/cashier/:order_no", handler.CashierGetOrder)
		pay.POST("/cashier/:order_no/init", handler.CashierInitPay)
		pay.POST("/cashier/:order_no/confirm", handler.CashierConfirmPay)

		pay.POST("/callback/alipay", handler.AlipayCallback)
		pay.POST("/callback/wechat", handler.WechatCallback)

		pay.GET("/mock/scan/:order_no", handler.MockPayScan)
		pay.POST("/mock/callback/:order_no", handler.MockPayCallback)

		pay.GET("/qr/:order_no", handler.PublicQRProxy)
		pay.GET("/h5/:order_no", handler.AlipayH5Form)

		// 收款链接（公开，无需签名）
		pay.GET("/l/:link_code", handler.PayLinkInfo)
		pay.POST("/l/:link_code", handler.PayLinkSubmit)

		// 收银台配置公开接口（无需签名）
		pay.GET("/c/:code", handler.CashierPublicInfo)
		pay.POST("/c/:code", handler.CashierPublicSubmit)
	}

	return r
}
