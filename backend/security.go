// 安全边界：会话密钥、CORS 白名单、鉴权中间件、默认账号播种。
//
// 设计要点：前端 VITE_APP_ROLE 的构建期隔离只决定"渲染哪套界面"，
// 不构成权限——真正的门禁全部在这里，逐个请求按 token 里的 role 判定。
package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"showroom-backend/internal/auth"
	"showroom-backend/internal/model"
)

// tokenTTL 会话有效期；员工端每 8 秒轮询，8 小时覆盖一个班次
var tokenTTL = time.Duration(intOr("TOKEN_TTL_HOURS", 8)) * time.Hour

// authSecret 会话签名密钥。未配置 AUTH_SECRET 时本次进程随机生成，
// 代价是重启后所有会话失效——单机演示可接受，正式部署必须固定配置。
var authSecret = initSecret()

func initSecret() []byte {
	if s := strings.TrimSpace(os.Getenv("AUTH_SECRET")); s != "" {
		if len(s) < 32 {
			log.Println("[warn] AUTH_SECRET 短于 32 字符，建议更换为更长的随机串")
		}
		return []byte(s)
	}
	log.Println("[warn] 未配置 AUTH_SECRET：本次进程使用随机密钥，重启后所有登录会话失效；正式部署请固定该环境变量")
	return auth.RandomSecret()
}

func intOr(k string, def int) int {
	n, err := strconv.Atoi(strings.TrimSpace(os.Getenv(k)))
	if err != nil || n <= 0 {
		return def
	}
	return n
}

// ---------------- CORS ----------------

// allowedOrigins 跨域白名单。开发期缺省放开本机三个 dev 端口；
// 生产用 ALLOWED_ORIGINS 显式配置（逗号分隔），未命中则不下发 Allow-Origin，浏览器自然拦截。
var allowedOrigins = initOrigins()

func initOrigins() map[string]bool {
	raw := strings.TrimSpace(os.Getenv("ALLOWED_ORIGINS"))
	if raw == "" {
		raw = "http://localhost:5173,http://127.0.0.1:5173," +
			"http://localhost:5184,http://127.0.0.1:5184," +
			"http://localhost:5175,http://127.0.0.1:5175"
		log.Println("[warn] 未配置 ALLOWED_ORIGINS：默认仅放开本机 dev 端口（5173/5184/5175）")
	}
	out := map[string]bool{}
	for _, o := range strings.Split(raw, ",") {
		if o = strings.TrimRight(strings.TrimSpace(o), "/"); o != "" {
			out[o] = true
		}
	}
	return out
}

// cors 精确回显白名单内的 Origin（不再用 *，避免任意网站借访客浏览器打内网接口）
func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && allowedOrigins[origin] {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			w.Header().Set("Access-Control-Max-Age", "600")
			w.Header().Set("Vary", "Origin")
		}
		w.Header().Set("X-Content-Type-Options", "nosniff")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// ---------------- 会话上下文 ----------------

type ctxKey int

const ctxClaims ctxKey = 1

// claimsOf 取当前请求的登录态；未登录返回 nil
func claimsOf(r *http.Request) *auth.Claims {
	c, _ := r.Context().Value(ctxClaims).(*auth.Claims)
	return c
}

// bearerToken 从 Authorization 头或 ?token= 取 token。
// 查询参数形式仅用于 <img>/<a> 这类无法自定义请求头的场景（如验证码图片、图纸下载）。
func bearerToken(r *http.Request) string {
	if h := r.Header.Get("Authorization"); h != "" {
		const p = "Bearer "
		if len(h) > len(p) && strings.EqualFold(h[:len(p)], p) {
			return strings.TrimSpace(h[len(p):])
		}
	}
	return strings.TrimSpace(r.URL.Query().Get("token"))
}

// parseClaims 只验签不查库，用于公开接口的"可选登录态"（如 entries 是否返回完整规格）
func parseClaims(r *http.Request) *auth.Claims {
	tok := bearerToken(r)
	if tok == "" {
		return nil
	}
	c, err := auth.Verify(tok, authSecret)
	if err != nil {
		return nil
	}
	return c
}

// withSession 解析并校验 token，同时复核账号是否仍有效（被停用/删除后立即失效）
func withSession(w http.ResponseWriter, r *http.Request) (*auth.Claims, *model.User, bool) {
	tok := bearerToken(r)
	if tok == "" {
		writeErr(w, http.StatusUnauthorized, "未登录")
		return nil, nil, false
	}
	c, err := auth.Verify(tok, authSecret)
	if err != nil {
		msg := "登录状态无效，请重新登录"
		if err == auth.ErrTokenExpire {
			msg = "登录已过期，请重新登录"
		}
		writeErr(w, http.StatusUnauthorized, msg)
		return nil, nil, false
	}
	u, err := st.GetUserByID(c.Sub)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "校验账号失败: "+err.Error())
		return nil, nil, false
	}
	if u == nil || !u.Active {
		writeErr(w, http.StatusUnauthorized, "账号已停用，请联系管理员")
		return nil, nil, false
	}
	// 角色与展示名以库为准，防止签发后管理员调整了权限而旧 token 仍带老角色
	c.Role = u.Role
	c.Name = u.DisplayName
	return c, u, true
}

// staff 要求登录；mustChange 未清除时只放行改密与查自己
func staff(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		c, u, ok := withSession(w, r)
		if !ok {
			return
		}
		if u.MustChange && !isSelfServicePath(r.URL.Path) {
			writeErr(w, http.StatusForbidden, "仍在用初始密码，请先修改密码")
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), ctxClaims, c)))
	}
}

// staffRoles 要求登录且角色在允许范围内（目录写入仅限销售/管理员）
func staffRoles(roles ...string) func(http.HandlerFunc) http.HandlerFunc {
	return func(next http.HandlerFunc) http.HandlerFunc {
		return staff(func(w http.ResponseWriter, r *http.Request) {
			c := claimsOf(r)
			for _, role := range roles {
				if c.Role == role {
					next.ServeHTTP(w, r)
					return
				}
			}
			writeErr(w, http.StatusForbidden, "当前角色无权执行该操作")
		})
	}
}

// adminOnly 仅管理员（账号管理）
func adminOnly(next http.HandlerFunc) http.HandlerFunc {
	return staffRoles(model.RoleAdmin)(next)
}

// isSelfServicePath 改密前唯一放行的路径。
// 没有 /api/logout：token 是无状态的，服务端无会话可销，退出登录纯粹是前端清存储。
func isSelfServicePath(p string) bool {
	return p == "/api/me" || p == "/api/change-password"
}

// ---------------- 默认账号播种 ----------------

// seedUsers 首次启动（users 表为空）时播种三个部门账号。
// 初始密码取自 SEED_PASSWORD，缺省 Showroom@2026，并置 must_change 强制首次登录改密。
func seedUsers() {
	n, err := st.CountUsers()
	if err != nil {
		log.Println("[warn] 检查账号表失败，跳过播种：", err)
		return
	}
	if n > 0 {
		return
	}
	pw := envOr("SEED_PASSWORD", "Showroom@2026")
	hash, err := auth.HashPassword(pw)
	if err != nil {
		log.Println("[fatal] 生成初始口令哈希失败：", err)
		return
	}
	seeds := []model.User{
		{Username: "sales01", Role: model.RoleSales, DisplayName: "销售01", Active: true, MustChange: true, PasswordHash: hash},
		{Username: "prod01", Role: model.RoleProduction, DisplayName: "生产01", Active: true, MustChange: true, PasswordHash: hash},
		{Username: "admin", Role: model.RoleAdmin, DisplayName: "系统管理员", Active: true, MustChange: true, PasswordHash: hash},
	}
	for i := range seeds {
		if err := st.CreateUser(&seeds[i]); err != nil {
			log.Printf("[warn] 播种账号 %s 失败：%v", seeds[i].Username, err)
		}
	}
	log.Printf("[warn] 已播种默认账号 sales01 / prod01 / admin，初始密码 %q —— 首次登录会强制修改，请立刻改密并通过 ALLOWED_ORIGINS/AUTH_SECRET 加固部署", pw)
}
