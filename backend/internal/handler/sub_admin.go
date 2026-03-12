package handler

import (
	"strconv"
	"xinipay/internal/model"
	"xinipay/pkg"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

type SubAdminRequest struct {
	Username    string `json:"username" binding:"required"`
	Password    string `json:"password"`
	Permissions string `json:"permissions"`
	Status      int    `json:"status"`
}

func GetSubAdmins(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "10"))

	userID, _ := c.Get("user_id")
	query := model.DB.Model(&model.SubAdmin{}).Where("parent_id = ?", userID)

	var total int64
	query.Count(&total)

	var admins []model.SubAdmin
	query.Order("id DESC").Offset((page - 1) * size).Limit(size).Find(&admins)

	pkg.SuccessWithPage(c, admins, total, page, size)
}

func CreateSubAdmin(c *gin.Context) {
	var req SubAdminRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		pkg.Fail(c, 400, "参数错误: "+err.Error())
		return
	}

	if req.Password == "" {
		pkg.Fail(c, 400, "请设置密码")
		return
	}

	hash, _ := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	userID, _ := c.Get("user_id")

	admin := model.SubAdmin{
		ParentID:     userID.(uint),
		Username:     req.Username,
		PasswordHash: string(hash),
		Permissions:  req.Permissions,
		Status:       req.Status,
	}

	if err := model.DB.Create(&admin).Error; err != nil {
		pkg.Fail(c, 500, "创建子管理员失败，用户名可能已存在")
		return
	}
	pkg.Success(c, admin)
}

func UpdateSubAdmin(c *gin.Context) {
	id := c.Param("id")
	var admin model.SubAdmin
	if err := model.DB.First(&admin, id).Error; err != nil {
		pkg.Fail(c, 404, "子管理员不存在")
		return
	}

	var req SubAdminRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		pkg.Fail(c, 400, "参数错误: "+err.Error())
		return
	}

	updates := model.SubAdmin{
		Username:    req.Username,
		Permissions: req.Permissions,
		Status:      req.Status,
	}

	if req.Password != "" {
		hash, _ := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		updates.PasswordHash = string(hash)
	}

	model.DB.Model(&admin).Updates(updates)
	pkg.Success(c, admin)
}

func DeleteSubAdmin(c *gin.Context) {
	id := c.Param("id")
	if err := model.DB.Delete(&model.SubAdmin{}, id).Error; err != nil {
		pkg.Fail(c, 500, "删除失败")
		return
	}
	pkg.Success(c, nil)
}
