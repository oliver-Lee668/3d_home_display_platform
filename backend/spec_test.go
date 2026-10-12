// 规格快照组装与公开视图脱敏的单元测试。
//
// 这两块是本轮鉴权改造里最要紧的服务端逻辑：
//   - composeSpec 决定「客户能不能给自己订单塞假工艺/假工时/假图纸」；
//   - sanitizeEntries 决定「未登录的人能看到多少规格主数据」。
//
// 下单接口有图形验证码挡着，脚本没法端到端跑通，所以直接在这里把行为钉死。
package main

import (
	"encoding/json"
	"testing"

	"showroom-backend/internal/model"
	"showroom-backend/internal/store"
)

// fullBaseline 一份「该有的都有」的服务端基线
func fullBaseline() *specBaseline {
	return &specBaseline{
		SKU: "SF-3P-2000", Category: "sofa", Group: "家具",
		BaseSizeW: 2.0, BaseSizeH: 0.85, BaseSizeD: 0.95,
		MaterialSku: "MAT-VELVET-07", Craft: "实木框架+高回弹海绵",
		Packing: "珍珠棉+五层瓦楞纸箱", LaborMinutes: 240,
		ScaleMin: 0.9, ScaleMax: 1.2,
		Drawings: []model.Drawing{{Name: "三人位沙发总装图", URL: "/uploads/sofa.pdf"}},
	}
}

// forgedClient 客户端伪造的提交：机密字段全部瞎填，非机密字段也与基线不一致
func forgedClient() *model.ItemSpec {
	return &model.ItemSpec{
		SKU: "FAKE-SKU", Category: "FAKE-CATEGORY", Group: "FAKE-GROUP",
		BaseSizeW: 9.9, BaseSizeH: 9.9, BaseSizeD: 9.9,
		SizeWMM: 99999, SizeHMM: 99999, SizeDMM: 99999,
		MaterialSku: "FAKE-MATERIAL", Craft: "客户自己写的工艺",
		Packing: "客户自己写的包装", LaborMinutes: 1,
		ScaleMin: 0.01, ScaleMax: 99,
		Drawings:  []model.Drawing{{Name: "假图纸", URL: "http://evil.example/x.pdf"}},
		ColorCode: "#8a6f4d",
		Views:     "data:image/jpeg;base64,CLIENTVIEW",
	}
}

// TestComposeSpecDropsClientSecrets 基线存在时，机密字段一律以服务端为准，客户端伪造值全部丢弃
func TestComposeSpecDropsClientSecrets(t *testing.T) {
	base := fullBaseline()
	got := composeSpec(forgedClient(), base, 1.0)

	checks := []struct {
		name string
		got  any
		want any
	}{
		{"MaterialSku", got.MaterialSku, base.MaterialSku},
		{"Craft", got.Craft, base.Craft},
		{"Packing", got.Packing, base.Packing},
		{"LaborMinutes", got.LaborMinutes, base.LaborMinutes},
		{"ScaleMin", got.ScaleMin, base.ScaleMin},
		{"ScaleMax", got.ScaleMax, base.ScaleMax},
		{"SKU", got.SKU, base.SKU},
		{"Category", got.Category, base.Category},
		{"Group", got.Group, base.Group},
		{"BaseSizeW", got.BaseSizeW, base.BaseSizeW},
		{"BaseSizeH", got.BaseSizeH, base.BaseSizeH},
		{"BaseSizeD", got.BaseSizeD, base.BaseSizeD},
	}
	for _, c := range checks {
		if c.got != c.want {
			t.Errorf("%s = %v，期望服务端基线值 %v", c.name, c.got, c.want)
		}
	}

	if len(got.Drawings) != 1 || got.Drawings[0].URL != base.Drawings[0].URL {
		t.Errorf("Drawings = %+v，期望只保留服务端基线图纸 %+v", got.Drawings, base.Drawings)
	}
}

// TestComposeSpecRecomputesMillimeters 毫米尺寸由服务端按 标准尺寸 × 缩放 重算，前端传的值不作数
func TestComposeSpecRecomputesMillimeters(t *testing.T) {
	base := fullBaseline() // 2.0 × 0.85 × 0.95 米
	got := composeSpec(forgedClient(), base, 1.1)

	if got.SizeWMM != 2200 || got.SizeHMM != 935 || got.SizeDMM != 1045 {
		t.Errorf("毫米尺寸 = %d×%d×%d，期望 2200×935×1045（2.0/0.85/0.95 × 1.1）",
			got.SizeWMM, got.SizeHMM, got.SizeDMM)
	}
}

// TestComposeSpecKeepsClientColorAndViews 色号与三视图来自客户端：客户自己选的材质、展示端渲染的图
func TestComposeSpecKeepsClientColorAndViews(t *testing.T) {
	client := forgedClient()
	got := composeSpec(client, fullBaseline(), 1.0)

	if got.ColorCode != client.ColorCode {
		t.Errorf("ColorCode = %q，期望客户端值 %q", got.ColorCode, client.ColorCode)
	}
	if got.Views != client.Views {
		t.Errorf("Views 未透传客户端三视图")
	}
}

// TestComposeSpecFallsBackToClientWhenNoBaseline 商品尚未维护规格时，非机密字段用客户端值兜底，机密字段保持为空
func TestComposeSpecFallsBackToClientWhenNoBaseline(t *testing.T) {
	client := &model.ItemSpec{
		SKU: "SF-3P-2000", Category: "sofa", Group: "家具",
		BaseSizeW: 2.0, BaseSizeH: 0.85, BaseSizeD: 0.95,
		ColorCode: "#8a6f4d", Views: "data:image/jpeg;base64,CLIENTVIEW",
		// 以下机密字段即便传了也不该出现
		Craft: "偷塞的工艺", Packing: "偷塞的包装", LaborMinutes: 1,
		MaterialSku: "偷塞的主材", Drawings: []model.Drawing{{Name: "假图纸", URL: "/x.pdf"}},
		ScaleMin: 0.01, ScaleMax: 99,
	}
	got := composeSpec(client, nil, 1.1)

	if got.SKU != "SF-3P-2000" || got.Category != "sofa" || got.Group != "家具" {
		t.Errorf("非机密字段未兜底客户端值：%+v", got)
	}
	if got.BaseSizeW != 2.0 || got.BaseSizeH != 0.85 || got.BaseSizeD != 0.95 {
		t.Errorf("标准尺寸未兜底客户端值：%v/%v/%v", got.BaseSizeW, got.BaseSizeH, got.BaseSizeD)
	}
	if got.SizeWMM != 2200 || got.SizeHMM != 935 || got.SizeDMM != 1045 {
		t.Errorf("毫米尺寸 = %d×%d×%d，期望 2200×935×1045", got.SizeWMM, got.SizeHMM, got.SizeDMM)
	}
	if got.ColorCode == "" || got.Views == "" {
		t.Error("色号与三视图应来自客户端")
	}
	if got.Craft != "" || got.Packing != "" || got.LaborMinutes != 0 || got.MaterialSku != "" {
		t.Errorf("无基线时机密字段必须为空，实际 craft=%q packing=%q labor=%d material=%q",
			got.Craft, got.Packing, got.LaborMinutes, got.MaterialSku)
	}
	if len(got.Drawings) != 0 {
		t.Errorf("无基线时图纸必须为空，实际 %+v", got.Drawings)
	}
	if got.ScaleMin != 0 || got.ScaleMax != 0 {
		t.Errorf("无基线时可行域必须为空，实际 %v~%v", got.ScaleMin, got.ScaleMax)
	}
}

// TestComposeSpecNilClient 老客户端不传 spec 时也不能 panic，机密字段仍来自基线
func TestComposeSpecNilClient(t *testing.T) {
	base := fullBaseline()
	got := composeSpec(nil, base, 1.0)

	if got.SKU != base.SKU || got.Craft != base.Craft || got.LaborMinutes != base.LaborMinutes {
		t.Errorf("基线字段未填充：%+v", got)
	}
	if got.SizeWMM != 2000 || got.SizeHMM != 850 || got.SizeDMM != 950 {
		t.Errorf("毫米尺寸 = %d×%d×%d，期望 2000×850×950", got.SizeWMM, got.SizeHMM, got.SizeDMM)
	}
	if got.ColorCode != "" || got.Views != "" {
		t.Error("client 为 nil 时色号与三视图应为空")
	}
}

// TestSanitizeEntriesWhitelist 公开视图把 spec 裁到只剩白名单，且绝不改动存储里的原始负载
func TestSanitizeEntriesWhitelist(t *testing.T) {
	raw := json.RawMessage(`{"id":"sofa-3p","price":4299,"spec":{
		"sku":"SF-3P-2000","scaleMin":0.9,"scaleMax":1.2,
		"materialSku":"MAT-VELVET-07","craft":"实木框架","packing":"瓦楞纸箱",
		"laborMinutes":240,"drawings":[{"name":"总装图","url":"/uploads/sofa.pdf"}]}}`)
	original := &model.CatalogEntry{EntryID: "po_sofa-3p", Type: model.EntryProductOverride, Payload: raw}

	out := sanitizeEntries([]*model.CatalogEntry{original})
	if len(out) != 1 {
		t.Fatalf("返回条目数 = %d，期望 1", len(out))
	}
	if out[0] == original {
		t.Fatal("sanitizeEntries 返回了原指针，未做副本")
	}

	var pub struct {
		Price float64        `json:"price"`
		Spec  map[string]any `json:"spec"`
	}
	if err := json.Unmarshal(out[0].Payload, &pub); err != nil {
		t.Fatalf("解析脱敏后负载失败：%v", err)
	}
	if len(pub.Spec) != 3 {
		t.Errorf("公开 spec 字段数 = %d（%v），期望恰好 3 个白名单字段", len(pub.Spec), pub.Spec)
	}
	for _, k := range []string{"sku", "scaleMin", "scaleMax"} {
		if _, ok := pub.Spec[k]; !ok {
			t.Errorf("公开 spec 缺少必需字段 %q（客户端缩放滑杆限位要用）", k)
		}
	}
	for _, k := range []string{"craft", "packing", "laborMinutes", "materialSku", "drawings"} {
		if _, ok := pub.Spec[k]; ok {
			t.Errorf("公开 spec 泄露了机密字段 %q", k)
		}
	}
	if pub.Price != 4299 {
		t.Errorf("spec 以外的字段被误改：price = %v，期望 4299", pub.Price)
	}

	// 原始负载不能被就地篡改——否则员工视图也会跟着丢字段
	if string(original.Payload) != string(raw) {
		t.Errorf("存储中的原始负载被修改：\n%s", original.Payload)
	}
}

// TestSanitizePayloadEdgeCases 无 spec / 空 spec / 非法 JSON / 空负载一律原样透传（ok=false）
func TestSanitizePayloadEdgeCases(t *testing.T) {
	cases := []struct {
		name string
		raw  json.RawMessage
	}{
		{"空负载", nil},
		{"非法 JSON", json.RawMessage(`{"id":`)},
		{"无 spec", json.RawMessage(`{"id":"floor-oak","url":"/uploads/oak.png"}`)},
		{"spec 不是对象", json.RawMessage(`{"id":"x","spec":"none"}`)},
		{"spec 为空对象", json.RawMessage(`{"id":"x","spec":{}}`)},
	}
	for _, c := range cases {
		trimmed, ok := sanitizePayload(c.raw)
		if ok {
			t.Errorf("%s：期望 ok=false 原样透传，实际返回 %s", c.name, trimmed)
		}
	}
}

// TestSpecBaselinesFromEntries 从目录条目还原规格主数据：只认 product_override / product_custom，坏负载跳过
func TestSpecBaselinesFromEntries(t *testing.T) {
	saved := st
	st = store.NewMemory()
	defer func() { st = saved }()

	mustUpsert := func(id string, typ model.EntryType, payload string) {
		t.Helper()
		if err := st.UpsertEntry(&model.CatalogEntry{
			EntryID: id, Type: typ, Payload: json.RawMessage(payload),
		}); err != nil {
			t.Fatalf("写入条目 %s 失败：%v", id, err)
		}
	}

	mustUpsert("po_sofa-3p", model.EntryProductOverride,
		`{"id":"sofa-3p","spec":{"sku":"SF-3P-2000","craft":"实木框架","laborMinutes":240,
		   "baseSizeW":2.0,"baseSizeH":0.85,"baseSizeD":0.95,"scaleMin":0.9,"scaleMax":1.2,
		   "drawings":[{"name":"总装图","url":"/uploads/sofa.pdf"}]}}`)
	mustUpsert("pc_custom-1", model.EntryProductCustom,
		`{"id":"custom-1","spec":{"sku":"CT-001","craft":"定制工艺","laborMinutes":60}}`)
	// 下架条目不带规格，必须跳过
	mustUpsert("pd_lamp-1", model.EntryProductDisable, `{"id":"lamp-1"}`)
	// 地板条目与商品无关，必须跳过
	mustUpsert("fc_oak", model.EntryFloorCustom, `{"id":"oak","spec":{"sku":"IGNORED"}}`)
	// 坏负载：缺 id / 缺 spec / 非法 JSON
	mustUpsert("po_no-id", model.EntryProductOverride, `{"spec":{"sku":"X"}}`)
	mustUpsert("po_no-spec", model.EntryProductOverride, `{"id":"sofa-2p"}`)
	mustUpsert("po_broken", model.EntryProductOverride, `{"id":`)

	got, err := specBaselines()
	if err != nil {
		t.Fatalf("specBaselines 失败：%v", err)
	}
	if len(got) != 2 {
		t.Fatalf("基线条目数 = %d（%v），期望 2（sofa-3p 与 custom-1）", len(got), keysOf(got))
	}

	sofa := got["sofa-3p"]
	if sofa == nil {
		t.Fatal("缺少 sofa-3p 的基线")
	}
	if sofa.SKU != "SF-3P-2000" || sofa.Craft != "实木框架" || sofa.LaborMinutes != 240 {
		t.Errorf("sofa-3p 基线解析错误：%+v", sofa)
	}
	if sofa.BaseSizeW != 2.0 || sofa.BaseSizeH != 0.85 || sofa.BaseSizeD != 0.95 {
		t.Errorf("sofa-3p 标准尺寸解析错误：%v/%v/%v", sofa.BaseSizeW, sofa.BaseSizeH, sofa.BaseSizeD)
	}
	if sofa.ScaleMin != 0.9 || sofa.ScaleMax != 1.2 {
		t.Errorf("sofa-3p 可行域解析错误：%v~%v", sofa.ScaleMin, sofa.ScaleMax)
	}
	if len(sofa.Drawings) != 1 || sofa.Drawings[0].URL != "/uploads/sofa.pdf" {
		t.Errorf("sofa-3p 图纸解析错误：%+v", sofa.Drawings)
	}
	if c := got["custom-1"]; c == nil || c.Craft != "定制工艺" {
		t.Errorf("product_custom 也应计入基线，实际 %+v", c)
	}
	if _, ok := got["lamp-1"]; ok {
		t.Error("product_disable 条目不该产生基线")
	}
	if _, ok := got["oak"]; ok {
		t.Error("地板条目不该产生基线")
	}
}

// TestSpecBaselinesEmptyStore 空库返回空 map 而非 nil，调用方可以直接索引
func TestSpecBaselinesEmptyStore(t *testing.T) {
	saved := st
	st = store.NewMemory()
	defer func() { st = saved }()

	got, err := specBaselines()
	if err != nil {
		t.Fatalf("specBaselines 失败：%v", err)
	}
	if got == nil {
		t.Fatal("期望空 map，实际为 nil")
	}
	if len(got) != 0 {
		t.Errorf("空库却有 %d 条基线：%v", len(got), keysOf(got))
	}
}

func keysOf(m map[string]*specBaseline) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}
