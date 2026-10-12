// 零依赖图形验证码：自绘 5x7 点阵数字 + 扭曲/干扰线/噪点，PNG 输出。
// 用途是给公开的下单接口加一道"证明是真人"的门槛，防脚本刷单塞满订单表。
package main

import (
	"bytes"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"image"
	"image/color"
	"image/png"
	"math"
	mrand "math/rand/v2"
	"strings"
	"sync"
	"time"
)

// digitFont 数字 0-9 的 5x7 点阵，每行低 5 位有效（bit4 = 最左像素）
var digitFont = [10][7]byte{
	{0x0E, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0E}, // 0
	{0x04, 0x0C, 0x04, 0x04, 0x04, 0x04, 0x0E}, // 1
	{0x0E, 0x11, 0x01, 0x02, 0x04, 0x08, 0x1F}, // 2
	{0x1F, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0E}, // 3
	{0x02, 0x06, 0x0A, 0x12, 0x1F, 0x02, 0x02}, // 4
	{0x1F, 0x10, 0x1E, 0x01, 0x01, 0x11, 0x0E}, // 5
	{0x06, 0x08, 0x10, 0x1E, 0x11, 0x11, 0x0E}, // 6
	{0x1F, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08}, // 7
	{0x0E, 0x11, 0x11, 0x0E, 0x11, 0x11, 0x0E}, // 8
	{0x0E, 0x11, 0x11, 0x0F, 0x01, 0x02, 0x0C}, // 9
}

const (
	captchaLen    = 4
	captchaScale  = 6
	captchaWidth  = 190
	captchaHeight = 64
	captchaTTL    = 3 * time.Minute
	captchaMax    = 5000 // 内存中同时存活的验证码上限，超出即拒绝签发
)

type captchaItem struct {
	answer string
	exp    time.Time
}

// captchaStore 一次性验证码池：校验成功或过期即销毁，不可重放
type captchaStore struct {
	mu   sync.Mutex
	pool map[string]captchaItem
}

var captchas = &captchaStore{pool: map[string]captchaItem{}}

var errCaptchaBusy = errors.New("验证码签发过于频繁，请稍后再试")

// issue 生成一张验证码，返回 ID 与 data URL
func (c *captchaStore) issue() (id, dataURL string, err error) {
	code, err := randomDigits(captchaLen)
	if err != nil {
		return "", "", err
	}
	id = randomID()

	c.mu.Lock()
	now := time.Now()
	for k, v := range c.pool {
		if now.After(v.exp) {
			delete(c.pool, k)
		}
	}
	if len(c.pool) >= captchaMax {
		c.mu.Unlock()
		return "", "", errCaptchaBusy
	}
	c.pool[id] = captchaItem{answer: code, exp: now.Add(captchaTTL)}
	c.mu.Unlock()

	return id, "data:image/png;base64," + base64.StdEncoding.EncodeToString(renderCaptcha(code)), nil
}

// consume 一次性校验：无论成功失败都销毁该 ID，避免重复尝试
func (c *captchaStore) consume(id, answer string) bool {
	id = strings.TrimSpace(id)
	answer = strings.TrimSpace(answer)
	if id == "" || answer == "" {
		return false
	}
	c.mu.Lock()
	item, ok := c.pool[id]
	delete(c.pool, id)
	c.mu.Unlock()
	if !ok || time.Now().After(item.exp) {
		return false
	}
	return strings.EqualFold(item.answer, answer)
}

// randomDigits 用 crypto/rand 取不可预测的数字串
func randomDigits(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	var sb strings.Builder
	for _, v := range b {
		sb.WriteByte('0' + v%10)
	}
	return sb.String(), nil
}

func randomID() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return strconvNowNano()
	}
	return hex.EncodeToString(b)
}

func strconvNowNano() string {
	return strings.ReplaceAll(time.Now().Format("20060102150405.000000000"), ".", "")
}

// renderCaptcha 把数字画成带扭曲与噪点的 PNG
func renderCaptcha(code string) []byte {
	img := image.NewRGBA(image.Rect(0, 0, captchaWidth, captchaHeight))

	// 背景：浅色 + 轻微渐变，保证打印/深色模式下都可读
	bgTop := color.RGBA{R: 236, G: 240, B: 246, A: 255}
	bgBot := color.RGBA{R: 214, G: 222, B: 233, A: 255}
	for y := 0; y < captchaHeight; y++ {
		t := float64(y) / float64(captchaHeight)
		c := color.RGBA{
			R: uint8(float64(bgTop.R) + (float64(bgBot.R)-float64(bgTop.R))*t),
			G: uint8(float64(bgTop.G) + (float64(bgBot.G)-float64(bgTop.G))*t),
			B: uint8(float64(bgTop.B) + (float64(bgBot.B)-float64(bgTop.B))*t),
			A: 255,
		}
		for x := 0; x < captchaWidth; x++ {
			img.SetRGBA(x, y, c)
		}
	}

	// 字符：逐个绘制并施加正弦错切 + 随机抖动，破坏 OCR 的行对齐假设
	for i := 0; i < len(code); i++ {
		d := code[i] - '0'
		fg := color.RGBA{
			R: uint8(mrand.IntN(90)),
			G: uint8(mrand.IntN(90)),
			B: uint8(mrand.IntN(120)),
			A: 255,
		}
		ox := 10 + i*44 + mrand.IntN(5)
		oy := 9 + mrand.IntN(7)
		phase := mrand.Float64() * math.Pi * 2
		for row := 0; row < 7; row++ {
			bits := digitFont[d][row]
			for col := 0; col < 5; col++ {
				if bits&(1<<(4-col)) == 0 {
					continue
				}
				// 每个像素按 scale 放大，并按 y 做水平错切
				for dy := 0; dy < captchaScale; dy++ {
					y := oy + row*captchaScale + dy
					if y < 0 || y >= captchaHeight {
						continue
					}
					shift := int(3 * math.Sin(float64(y)/5.0+phase))
					for dx := 0; dx < captchaScale; dx++ {
						x := ox + col*captchaScale + dx + shift
						if x < 0 || x >= captchaWidth {
							continue
						}
						img.SetRGBA(x, y, fg)
					}
				}
			}
		}
	}

	// 干扰线：4 条随机折线
	for n := 0; n < 4; n++ {
		line := color.RGBA{
			R: uint8(60 + mrand.IntN(120)),
			G: uint8(60 + mrand.IntN(120)),
			B: uint8(60 + mrand.IntN(120)),
			A: 255,
		}
		x0, y0 := mrand.IntN(captchaWidth/2), mrand.IntN(captchaHeight)
		x1, y1 := captchaWidth/2+mrand.IntN(captchaWidth/2), mrand.IntN(captchaHeight)
		steps := captchaWidth
		for s := 0; s <= steps; s++ {
			t := float64(s) / float64(steps)
			x := int(float64(x0) + (float64(x1)-float64(x0))*t)
			y := int(float64(y0) + (float64(y1)-float64(y0))*t + 3*math.Sin(t*9+phaseOf(n)))
			if x >= 0 && x < captchaWidth && y >= 0 && y < captchaHeight {
				img.SetRGBA(x, y, line)
				if y+1 < captchaHeight {
					img.SetRGBA(x, y+1, line)
				}
			}
		}
	}

	// 噪点
	for n := 0; n < 260; n++ {
		x, y := mrand.IntN(captchaWidth), mrand.IntN(captchaHeight)
		img.SetRGBA(x, y, color.RGBA{
			R: uint8(mrand.IntN(255)), G: uint8(mrand.IntN(255)), B: uint8(mrand.IntN(255)), A: 160,
		})
	}

	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return nil
	}
	return buf.Bytes()
}

func phaseOf(n int) float64 { return float64(n)*1.7 + 0.4 }
