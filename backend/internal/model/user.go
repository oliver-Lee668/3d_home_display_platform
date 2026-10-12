// 员工账号与角色权限模型
package model

import "time"

// 员工角色。注意：前端 VITE_APP_ROLE 只决定"渲染哪套界面"，
// 真正的权限以登录 token 里的 role 为准（后端逐请求校验）。
const (
	RoleSales      = "sales"      // 销售：确认订单、维护商品库/规格/地板、退回后重新提交
	RoleProduction = "production" // 生产：生产确认、完成、退回销售
	RoleAdmin      = "admin"      // 管理员：全部动作 + 账号管理
)

// RoleLabel 角色中文名（写入流转历史）
var RoleLabel = map[string]string{
	RoleSales:      "销售部",
	RoleProduction: "生产部",
	RoleAdmin:      "管理员",
}

// ValidRole 是否为合法角色
func ValidRole(role string) bool {
	switch role {
	case RoleSales, RoleProduction, RoleAdmin:
		return true
	}
	return false
}

// actionRoles 动作级权限：每个流转动作允许哪些角色执行。
// 只校验状态机不够——生产部的人拿到销售端 URL 也能提交 sales_confirm，
// 因此"谁可以做这个动作"必须由后端按 token 里的 role 判定。
var actionRoles = map[string][]string{
	"sales_confirm":      {RoleSales, RoleAdmin},
	"production_confirm": {RoleProduction, RoleAdmin},
	"complete":           {RoleProduction, RoleAdmin},
	"reject":             {RoleProduction, RoleAdmin},
	"resubmit":           {RoleSales, RoleAdmin},
}

// CanPerformAction 该角色是否有权执行该流转动作。
// 未知动作返回 false（交由状态机给出更具体的错误信息前先拦掉越权）。
func CanPerformAction(role, action string) bool {
	if role == RoleAdmin {
		return true
	}
	for _, r := range actionRoles[action] {
		if r == role {
			return true
		}
	}
	return false
}

// KnownAction 是否为已定义的流转动作
func KnownAction(action string) bool {
	_, ok := actionRoles[action]
	return ok
}

// User 员工账号。PasswordHash 绝不外泄（json:"-"）。
type User struct {
	ID           int64  `json:"id"`
	Username     string `json:"username"`
	PasswordHash string `json:"-"`
	Role         string `json:"role"`
	DisplayName  string `json:"displayName"`
	Active       bool   `json:"active"`
	// MustChange 仍在用初始密码：除改密与查自己之外的员工接口一律 403
	MustChange bool      `json:"mustChange"`
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`
}

// PasswordPolicyError 口令强度不足时的提示
const PasswordPolicyError = "密码至少 8 位，且同时包含字母与数字"

// PasswordOK 校验口令强度（长度 + 字母与数字共存）
func PasswordOK(pw string) bool {
	if len(pw) < 8 {
		return false
	}
	var hasLetter, hasDigit bool
	for _, r := range pw {
		switch {
		case r >= '0' && r <= '9':
			hasDigit = true
		case (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z'):
			hasLetter = true
		}
	}
	return hasLetter && hasDigit
}
