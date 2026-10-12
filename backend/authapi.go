// 员工登录、会话自查、改密与账号管理的 HTTP 处理器
package main

import (
	"crypto/subtle"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"showroom-backend/internal/auth"
	"showroom-backend/internal/model"
)

// dummyHash 用于"用户名不存在"时的等时比较：
// 否则查无此人会跳过 PBKDF2 直接返回，响应时间差可被用来枚举有效用户名。
var dummyHash = initDummyHash()

func initDummyHash() string {
	h, err := auth.HashPassword("dummy-password-for-timing-equalization")
	if err != nil {
		log.Println("[warn] 生成等时比较用哈希失败：", err)
		return ""
	}
	return h
}

// 登录限流阈值：同一 IP 5 分钟内最多 20 次尝试；同一用户名 10 分钟内最多 8 次
const (
	loginIPWindow   = 5 * time.Minute
	loginIPMax      = 20
	loginUserWindow = 10 * time.Minute
	loginUserMax    = 8
)

// 客户端自助查单限流（防订单号/手机号被脚本遍历）
const (
	lookupWindow = time.Minute
	lookupMax    = 20
)

type loginReq struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type sessionUser struct {
	Username    string `json:"username"`
	Role        string `json:"role"`
	DisplayName string `json:"displayName"`
	MustChange  bool   `json:"mustChange"`
}

type loginResp struct {
	Token     string      `json:"token"`
	ExpiresAt int64       `json:"expiresAt"`
	User      sessionUser `json:"user"`
}

func handleLogin(w http.ResponseWriter, r *http.Request) {
	ip := clientIP(r)
	if !rateLimiter.allow("login-ip:"+ip, loginIPWindow, loginIPMax) {
		retry := rateLimiter.retryAfter("login-ip:"+ip, loginIPWindow)
		w.Header().Set("Retry-After", strconv.Itoa(retry))
		writeErr(w, http.StatusTooManyRequests, "尝试过于频繁，请稍后再试")
		return
	}

	var req loginReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "请求体解析失败")
		return
	}
	req.Username = strings.ToLower(strings.TrimSpace(req.Username))
	if req.Username == "" || req.Password == "" {
		writeErr(w, http.StatusBadRequest, "请输入用户名与密码")
		return
	}

	userKey := "login-user:" + req.Username
	if !rateLimiter.allow(userKey, loginUserWindow, loginUserMax) {
		retry := rateLimiter.retryAfter(userKey, loginUserWindow)
		w.Header().Set("Retry-After", strconv.Itoa(retry))
		writeErr(w, http.StatusTooManyRequests, "该账号失败次数过多，已临时锁定，请 10 分钟后再试")
		return
	}

	u, err := st.GetUser(req.Username)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "查询账号失败: "+err.Error())
		return
	}
	// 统一走一次口令校验，抹平"用户不存在"与"密码错误"的时间差
	hash := dummyHash
	if u != nil {
		hash = u.PasswordHash
	}
	if !auth.VerifyPassword(req.Password, hash) || u == nil {
		writeErr(w, http.StatusUnauthorized, "用户名或密码错误")
		return
	}
	if !u.Active {
		writeErr(w, http.StatusForbidden, "账号已停用，请联系管理员")
		return
	}

	now := time.Now()
	exp := now.Add(tokenTTL)
	token, err := auth.Sign(auth.Claims{
		Sub:  u.ID,
		User: u.Username,
		Role: u.Role,
		Name: u.DisplayName,
		Iat:  now.Unix(),
		Exp:  exp.Unix(),
	}, authSecret)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "签发会话失败: "+err.Error())
		return
	}
	log.Printf("[login] %s(%s/%s) 从 %s 登录", u.Username, model.RoleLabel[u.Role], u.DisplayName, ip)
	writeJSON(w, http.StatusOK, loginResp{
		Token:     token,
		ExpiresAt: exp.Unix(),
		User: sessionUser{
			Username:    u.Username,
			Role:        u.Role,
			DisplayName: u.DisplayName,
			MustChange:  u.MustChange,
		},
	})
}

// handleMe 返回当前登录态（前端刷新页面后恢复界面上的登录人）
func handleMe(w http.ResponseWriter, r *http.Request) {
	c := claimsOf(r)
	u, err := st.GetUserByID(c.Sub)
	if err != nil || u == nil {
		writeErr(w, http.StatusUnauthorized, "登录状态无效，请重新登录")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"user": sessionUser{
			Username:    u.Username,
			Role:        u.Role,
			DisplayName: u.DisplayName,
			MustChange:  u.MustChange,
		},
		"roleLabel": model.RoleLabel[u.Role],
		"expiresAt": c.Exp,
	})
}

type changePwReq struct {
	OldPassword string `json:"oldPassword"`
	NewPassword string `json:"newPassword"`
}

func handleChangePassword(w http.ResponseWriter, r *http.Request) {
	c := claimsOf(r)
	var req changePwReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "请求体解析失败")
		return
	}
	u, err := st.GetUserByID(c.Sub)
	if err != nil || u == nil {
		writeErr(w, http.StatusUnauthorized, "登录状态无效，请重新登录")
		return
	}
	if !auth.VerifyPassword(req.OldPassword, u.PasswordHash) {
		writeErr(w, http.StatusBadRequest, "原密码不正确")
		return
	}
	if !model.PasswordOK(req.NewPassword) {
		writeErr(w, http.StatusBadRequest, model.PasswordPolicyError)
		return
	}
	if subtle.ConstantTimeCompare([]byte(req.OldPassword), []byte(req.NewPassword)) == 1 {
		writeErr(w, http.StatusBadRequest, "新密码不能与原密码相同")
		return
	}
	hash, err := auth.HashPassword(req.NewPassword)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "生成口令哈希失败: "+err.Error())
		return
	}
	if err := st.UpdateUserPassword(u.ID, hash); err != nil {
		writeErr(w, http.StatusInternalServerError, "保存失败: "+err.Error())
		return
	}
	log.Printf("[login] %s 修改了密码", u.Username)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

type createUserReq struct {
	Username    string `json:"username"`
	Password    string `json:"password"`
	Role        string `json:"role"`
	DisplayName string `json:"displayName"`
}

// handleCreateUser 管理员开号（前端未做管理界面，用接口/脚本开号）
func handleCreateUser(w http.ResponseWriter, r *http.Request) {
	var req createUserReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "请求体解析失败")
		return
	}
	req.Username = strings.ToLower(strings.TrimSpace(req.Username))
	req.DisplayName = strings.TrimSpace(req.DisplayName)
	if req.Username == "" || req.DisplayName == "" {
		writeErr(w, http.StatusBadRequest, "用户名与姓名必填")
		return
	}
	if !model.ValidRole(req.Role) {
		writeErr(w, http.StatusBadRequest, "角色必须是 sales / production / admin 之一")
		return
	}
	if !model.PasswordOK(req.Password) {
		writeErr(w, http.StatusBadRequest, model.PasswordPolicyError)
		return
	}
	if exists, _ := st.GetUser(req.Username); exists != nil {
		writeErr(w, http.StatusConflict, "用户名已存在")
		return
	}
	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "生成口令哈希失败: "+err.Error())
		return
	}
	u := &model.User{
		Username:     req.Username,
		PasswordHash: hash,
		Role:         req.Role,
		DisplayName:  req.DisplayName,
		Active:       true,
		MustChange:   true, // 管理员代开的初始密码同样强制首次改密
	}
	if err := st.CreateUser(u); err != nil {
		writeErr(w, http.StatusInternalServerError, "创建失败: "+err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, u)
}
