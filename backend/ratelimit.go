// 简单滑动窗口限流：给公开接口（登录、下单、验证码、查单）加频次门槛。
// 内存实现，单实例部署足够；多实例需换 Redis。
package main

import (
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

// trustProxy 是否信任 X-Forwarded-For。默认不信任——
// 该头可被客户端任意伪造，信任它等于让限流形同虚设；只有确实部署在反向代理后才置 1。
var trustProxy = os.Getenv("TRUST_PROXY") == "1"

type limiter struct {
	mu      sync.Mutex
	buckets map[string][]time.Time
}

// maxKeys 桶数量上限，防止攻击者用海量不同 key 撑爆内存
const maxKeys = 20000

var rateLimiter = &limiter{buckets: map[string][]time.Time{}}

// allow 判定 key 在 window 内的命中次数是否仍低于 maxHits；命中则记录本次
func (l *limiter) allow(key string, window time.Duration, maxHits int) bool {
	now := time.Now()
	cut := now.Add(-window)

	l.mu.Lock()
	defer l.mu.Unlock()

	hits := l.buckets[key]
	kept := hits[:0]
	for _, t := range hits {
		if t.After(cut) {
			kept = append(kept, t)
		}
	}
	if len(kept) >= maxHits {
		l.buckets[key] = kept
		return false
	}
	l.buckets[key] = append(kept, now)

	// 顺带回收其它已过期的桶，避免长期运行后内存只增不减
	if len(l.buckets) > maxKeys {
		for k, v := range l.buckets {
			alive := v[:0]
			for _, t := range v {
				if t.After(cut) {
					alive = append(alive, t)
				}
			}
			if len(alive) == 0 {
				delete(l.buckets, k)
			} else {
				l.buckets[k] = alive
			}
		}
	}
	return true
}

// retryAfter 该 key 距窗口内最早一次命中过期还有多久（用于 429 的 Retry-After）
func (l *limiter) retryAfter(key string, window time.Duration) int {
	l.mu.Lock()
	defer l.mu.Unlock()
	hits := l.buckets[key]
	if len(hits) == 0 {
		return 1
	}
	d := time.Until(hits[0].Add(window))
	if d <= 0 {
		return 1
	}
	return int(d.Seconds()) + 1
}

// clientIP 取客户端 IP。默认只信 RemoteAddr；仅当 TRUST_PROXY=1 时才读 X-Forwarded-For。
func clientIP(r *http.Request) string {
	if trustProxy {
		if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
			if i := strings.IndexByte(xff, ','); i >= 0 {
				xff = xff[:i]
			}
			if xff = strings.TrimSpace(xff); xff != "" {
				return xff
			}
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
