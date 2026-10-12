// 认证基础设施：口令哈希（PBKDF2-HMAC-SHA256）与会话 token（HMAC-SHA256 签名）。
// 全部使用 Go 标准库，零第三方依赖。
package auth

import (
	"crypto/hmac"
	"crypto/pbkdf2"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"
)

// PBKDF2 参数：OWASP 对 PBKDF2-HMAC-SHA256 的最低建议为 600k 次，
// 这里取 210k 以兼顾低配服务器上的登录耗时（实测约 80~120ms），仍远高于暴力破解可行域。
const (
	pbkdf2Iter   = 210_000
	pbkdf2KeyLen = 32
	saltLen      = 16
)

var (
	ErrBadToken    = errors.New("token 非法")
	ErrTokenExpire = errors.New("登录已过期")
)

// HashPassword 生成 `pbkdf2$<iter>$<salt-b64>$<hash-b64>` 形式的哈希串。
// 迭代次数写进串里，将来提高强度时旧哈希仍可校验。
func HashPassword(password string) (string, error) {
	salt := make([]byte, saltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	key, err := pbkdf2.Key(sha256.New, password, salt, pbkdf2Iter, pbkdf2KeyLen)
	if err != nil {
		return "", err
	}
	e := base64.RawURLEncoding
	return fmt.Sprintf("pbkdf2$%d$%s$%s", pbkdf2Iter, e.EncodeToString(salt), e.EncodeToString(key)), nil
}

// VerifyPassword 恒定时间比较，避免时序侧信道
func VerifyPassword(password, encoded string) bool {
	parts := strings.Split(encoded, "$")
	if len(parts) != 4 || parts[0] != "pbkdf2" {
		return false
	}
	iter, err := strconv.Atoi(parts[1])
	if err != nil || iter <= 0 {
		return false
	}
	e := base64.RawURLEncoding
	salt, err := e.DecodeString(parts[2])
	if err != nil {
		return false
	}
	want, err := e.DecodeString(parts[3])
	if err != nil {
		return false
	}
	got, err := pbkdf2.Key(sha256.New, password, salt, iter, len(want))
	if err != nil {
		return false
	}
	return subtle.ConstantTimeCompare(got, want) == 1
}

// Claims 会话载荷（不含口令，可安全地被前端解码用于展示登录人）
type Claims struct {
	Sub  int64  `json:"sub"`  // 用户 ID
	User string `json:"usr"`  // 用户名
	Role string `json:"role"` // sales / production / admin
	Name string `json:"name"` // 展示名（写入流转历史）
	Iat  int64  `json:"iat"`
	Exp  int64  `json:"exp"`
}

// Sign 生成 `<payload-b64>.<sig-b64>` 形式的紧凑 token。
// 结构与 JWT 的 HS256 一致，但不引入 JWT 库（本项目只需签名与过期校验）。
func Sign(c Claims, secret []byte) (string, error) {
	if len(secret) == 0 {
		return "", errors.New("缺少签名密钥")
	}
	payload, err := json.Marshal(c)
	if err != nil {
		return "", err
	}
	p := base64.RawURLEncoding.EncodeToString(payload)
	return p + "." + sig(p, secret), nil
}

// Verify 校验签名与有效期，返回载荷
func Verify(token string, secret []byte) (*Claims, error) {
	if len(secret) == 0 {
		return nil, ErrBadToken
	}
	i := strings.LastIndexByte(token, '.')
	if i <= 0 || i == len(token)-1 {
		return nil, ErrBadToken
	}
	p, s := token[:i], token[i+1:]
	if subtle.ConstantTimeCompare([]byte(s), []byte(sig(p, secret))) != 1 {
		return nil, ErrBadToken
	}
	raw, err := base64.RawURLEncoding.DecodeString(p)
	if err != nil {
		return nil, ErrBadToken
	}
	var c Claims
	if err := json.Unmarshal(raw, &c); err != nil {
		return nil, ErrBadToken
	}
	if time.Now().Unix() > c.Exp {
		return nil, ErrTokenExpire
	}
	return &c, nil
}

// RandomSecret 生成 32 字节随机密钥（未配置 AUTH_SECRET 时用于本次进程）
func RandomSecret() []byte {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		// crypto/rand 失败属于系统级异常，退化到时间派生以保证可启动
		h := sha256.Sum256([]byte(strconv.FormatInt(time.Now().UnixNano(), 10)))
		return h[:]
	}
	return b
}

func sig(payload string, secret []byte) string {
	m := hmac.New(sha256.New, secret)
	m.Write([]byte(payload))
	return base64.RawURLEncoding.EncodeToString(m.Sum(nil))
}
