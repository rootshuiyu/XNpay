package handler

import (
	"xinipay/internal/middleware"
	"xinipay/internal/model"
	"xinipay/pkg"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

type LoginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type LoginResponse struct {
	Token    string      `json:"token"`
	UserInfo model.Admin `json:"user_info"`
}

func Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		pkg.Fail(c, 400, "请输入用户名和密码")
		return
	}

	var admin model.Admin
	if err := model.DB.Where("username = ? AND status = 1", req.Username).First(&admin).Error; err != nil {
		pkg.Fail(c, 401, "用户名或密码错误")
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(admin.PasswordHash), []byte(req.Password)); err != nil {
		pkg.Fail(c, 401, "用户名或密码错误")
		return
	}

	token, err := middleware.GenerateToken(admin.ID, admin.Username, admin.Role)
	if err != nil {
		pkg.Fail(c, 500, "生成令牌失败")
		return
	}

	pkg.Success(c, LoginResponse{
		Token:    token,
		UserInfo: admin,
	})
}

func GetProfile(c *gin.Context) {
	userID, _ := c.Get("user_id")

	var admin model.Admin
	if err := model.DB.First(&admin, userID).Error; err != nil {
		pkg.Fail(c, 404, "用户不存在")
		return
	}

	pkg.Success(c, admin)
}

func Logout(c *gin.Context) {
	pkg.Success(c, nil)
}

type ChangePasswordRequest struct {
	OldPassword string `json:"old_password" binding:"required"`
	NewPassword string `json:"new_password" binding:"required,min=6"`
}

func ChangePassword(c *gin.Context) {
	var req ChangePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		pkg.Fail(c, 400, "请输入有效的密码")
		return
	}

	userID, _ := c.Get("user_id")
	var admin model.Admin
	if err := model.DB.First(&admin, userID).Error; err != nil {
		pkg.Fail(c, 404, "用户不存在")
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(admin.PasswordHash), []byte(req.OldPassword)); err != nil {
		pkg.Fail(c, 400, "原密码错误")
		return
	}

	hash, _ := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	model.DB.Model(&admin).Update("password_hash", string(hash))
	pkg.Success(c, nil)
}
