package handler

import (
	"fmt"
	"strconv"

	"xinipay/internal/model"
	"xinipay/pkg"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

func AdminGetMerchants(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "10"))
	name := c.Query("name")

	query := model.DB.Model(&model.Merchant{})
	if name != "" {
		query = query.Where("username LIKE ? OR nickname LIKE ?", "%"+name+"%", "%"+name+"%")
	}

	var total int64
	query.Count(&total)

	var merchants []model.Merchant
	query.Order("id ASC").Offset((page - 1) * size).Limit(size).Find(&merchants)

	type MerchantListItem struct {
		model.Merchant
		SubCount    int64   `json:"sub_count"`
		OrderCount  int64   `json:"order_count"`
		OrderAmount float64 `json:"order_amount"`
	}

	items := make([]MerchantListItem, 0, len(merchants))
	for _, m := range merchants {
		var subCount, orderCount int64
		var orderAmount float64
		model.DB.Model(&model.Merchant{}).Where("parent_id = ?", m.ID).Count(&subCount)
		model.DB.Model(&model.PaymentOrder{}).Where("merchant_id = ?", m.ID).Count(&orderCount)
		model.DB.Model(&model.PaymentOrder{}).Where("merchant_id = ? AND status = 'paid'", m.ID).
			Select("COALESCE(SUM(amount), 0)").Scan(&orderAmount)
		items = append(items, MerchantListItem{
			Merchant:    m,
			SubCount:    subCount,
			OrderCount:  orderCount,
			OrderAmount: orderAmount,
		})
	}

	pkg.SuccessWithPage(c, items, total, page, size)
}

type MerchantTreeNode struct {
	ID       uint               `json:"id"`
	Username string             `json:"username"`
	Nickname string             `json:"nickname"`
	Level    int                `json:"level"`
	FeeRate  float64            `json:"fee_rate"`
	Status   int                `json:"status"`
	Balance  float64            `json:"balance"`
	Children []MerchantTreeNode `json:"children"`
}

func AdminGetMerchantTree(c *gin.Context) {
	var allMerchants []model.Merchant
	model.DB.Order("level ASC, id ASC").Find(&allMerchants)

	idMap := make(map[uint]*MerchantTreeNode)
	var roots []MerchantTreeNode

	for _, m := range allMerchants {
		node := MerchantTreeNode{
			ID:       m.ID,
			Username: m.Username,
			Nickname: m.Nickname,
			Level:    m.Level,
			FeeRate:  m.FeeRate,
			Status:   m.Status,
			Balance:  m.Balance,
			Children: []MerchantTreeNode{},
		}
		idMap[m.ID] = &node

		if m.ParentID == nil {
			roots = append(roots, node)
			idMap[m.ID] = &roots[len(roots)-1]
		}
	}

	for _, m := range allMerchants {
		if m.ParentID != nil {
			if parent, ok := idMap[*m.ParentID]; ok {
				child := idMap[m.ID]
				parent.Children = append(parent.Children, *child)
			}
		}
	}

	pkg.Success(c, roots)
}

func AdminCreateMerchant(c *gin.Context) {
	var req struct {
		Username string  `json:"username" binding:"required"`
		Password string  `json:"password" binding:"required,min=6"`
		Nickname string  `json:"nickname"`
		FeeRate  float64 `json:"fee_rate"`
		ParentID *uint   `json:"parent_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		pkg.Fail(c, 400, "参数错误: "+err.Error())
		return
	}

	var exists int64
	model.DB.Model(&model.Merchant{}).Where("username = ?", req.Username).Count(&exists)
	if exists > 0 {
		pkg.Fail(c, 400, "用户名已存在")
		return
	}

	hash, _ := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	nickname := req.Nickname
	if nickname == "" {
		nickname = req.Username
	}

	merchant := model.Merchant{
		ParentID:     req.ParentID,
		Username:     req.Username,
		PasswordHash: string(hash),
		Nickname:     nickname,
		InviteCode:   model.GenerateInviteCode(),
		FeeRate:      req.FeeRate,
		Status:       1,
	}

	if req.ParentID != nil {
		var parent model.Merchant
		if err := model.DB.First(&parent, *req.ParentID).Error; err != nil {
			pkg.Fail(c, 400, "上级商户不存在")
			return
		}
		merchant.Level = parent.Level + 1
		if err := model.DB.Create(&merchant).Error; err != nil {
			pkg.Fail(c, 500, "创建失败")
			return
		}
		merchant.Path = fmt.Sprintf("%s/%d", parent.Path, merchant.ID)
	} else {
		merchant.Level = 1
		if err := model.DB.Create(&merchant).Error; err != nil {
			pkg.Fail(c, 500, "创建失败")
			return
		}
		merchant.Path = fmt.Sprintf("%d", merchant.ID)
	}

	model.DB.Save(&merchant)
	pkg.Success(c, merchant)
}

func AdminGetMerchantDetail(c *gin.Context) {
	id := c.Param("id")
	var merchant model.Merchant
	if err := model.DB.Preload("Parent").First(&merchant, id).Error; err != nil {
		pkg.Fail(c, 404, "商户不存在")
		return
	}

	var subCount, channelCount, accountCount, orderCount int64
	var orderAmount float64
	model.DB.Model(&model.Merchant{}).Where("parent_id = ?", merchant.ID).Count(&subCount)
	model.DB.Model(&model.GameChannel{}).Where("merchant_id = ?", merchant.ID).Count(&channelCount)
	model.DB.Model(&model.GameAccount{}).Where("merchant_id = ?", merchant.ID).Count(&accountCount)
	model.DB.Model(&model.PaymentOrder{}).Where("merchant_id = ?", merchant.ID).Count(&orderCount)
	model.DB.Model(&model.PaymentOrder{}).Where("merchant_id = ? AND status = 'paid'", merchant.ID).
		Select("COALESCE(SUM(amount), 0)").Scan(&orderAmount)

	pkg.Success(c, gin.H{
		"merchant":      merchant,
		"sub_count":     subCount,
		"channel_count": channelCount,
		"account_count": accountCount,
		"order_count":   orderCount,
		"order_amount":  orderAmount,
	})
}

func AdminUpdateMerchant(c *gin.Context) {
	id := c.Param("id")
	var merchant model.Merchant
	if err := model.DB.First(&merchant, id).Error; err != nil {
		pkg.Fail(c, 404, "商户不存在")
		return
	}

	var req struct {
		Nickname string  `json:"nickname"`
		FeeRate  float64 `json:"fee_rate"`
		Status   int     `json:"status"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		pkg.Fail(c, 400, "参数错误")
		return
	}

	model.DB.Model(&merchant).Updates(map[string]interface{}{
		"nickname": req.Nickname,
		"fee_rate": req.FeeRate,
		"status":   req.Status,
	})
	pkg.Success(c, merchant)
}

func AdminToggleMerchantStatus(c *gin.Context) {
	id := c.Param("id")
	var merchant model.Merchant
	if err := model.DB.First(&merchant, id).Error; err != nil {
		pkg.Fail(c, 404, "商户不存在")
		return
	}

	newStatus := 1
	if merchant.Status == 1 {
		newStatus = 0
	}
	model.DB.Model(&merchant).Update("status", newStatus)
	pkg.Success(c, nil)
}

func AdminGetMerchantStats(c *gin.Context) {
	id := c.Param("id")
	var merchant model.Merchant
	if err := model.DB.First(&merchant, id).Error; err != nil {
		pkg.Fail(c, 404, "商户不存在")
		return
	}

	pathPrefix := merchant.Path + "/%"

	var allDescendants int64
	model.DB.Model(&model.Merchant{}).Where("path LIKE ?", pathPrefix).Count(&allDescendants)

	var totalOrders int64
	var totalAmount float64
	model.DB.Model(&model.PaymentOrder{}).Where("merchant_id = ?", merchant.ID).Count(&totalOrders)
	model.DB.Model(&model.PaymentOrder{}).Where("merchant_id = ? AND status = 'paid'", merchant.ID).
		Select("COALESCE(SUM(amount), 0)").Scan(&totalAmount)

	var treeOrders int64
	var treeAmount float64
	var descendantIDs []uint
	model.DB.Model(&model.Merchant{}).Where("path LIKE ? OR id = ?", pathPrefix, merchant.ID).Pluck("id", &descendantIDs)
	if len(descendantIDs) > 0 {
		model.DB.Model(&model.PaymentOrder{}).Where("merchant_id IN ?", descendantIDs).Count(&treeOrders)
		model.DB.Model(&model.PaymentOrder{}).Where("merchant_id IN ? AND status = 'paid'", descendantIDs).
			Select("COALESCE(SUM(amount), 0)").Scan(&treeAmount)
	}

	pkg.Success(c, gin.H{
		"merchant_orders":  totalOrders,
		"merchant_amount":  totalAmount,
		"tree_descendants": allDescendants,
		"tree_orders":      treeOrders,
		"tree_amount":      treeAmount,
	})
}
