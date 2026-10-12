// 规格主数据的服务端权威副本与公开视图脱敏。
//
// 两条原则：
//  1. 机密字段（工艺路线、包装、工时、主材编码、图纸）只能由服务端从目录条目填充，
//     客户端提交的一律丢弃——客户端本来也拿不到（公开接口已脱敏）。
//  2. 非机密字段（型号、分类、车间分组、标准尺寸、色号、三视图）允许客户端兜底，
//     因为客户本来就看得见，且这样即使销售端尚未 bootstrap 规格，工单仍有正确的毫米尺寸。
package main

import (
	"encoding/json"

	"showroom-backend/internal/model"
)

// publicSpecFields 未登录时 spec 里允许暴露给客户端的字段
var publicSpecFields = map[string]bool{
	"sku":      true,
	"scaleMin": true,
	"scaleMax": true,
}

// specBaseline 服务端持有的完整规格（来自销售端维护的目录条目）
type specBaseline struct {
	SKU          string
	Category     string
	Group        string
	BaseSizeW    float64
	BaseSizeH    float64
	BaseSizeD    float64
	MaterialSku  string
	Craft        string
	Packing      string
	LaborMinutes int
	ScaleMin     float64
	ScaleMax     float64
	Drawings     []model.Drawing
}

// specBaselines 按商品 ID 汇总规格主数据（product_override 与 product_custom 都算）
func specBaselines() (map[string]*specBaseline, error) {
	out := map[string]*specBaseline{}
	list, err := st.ListEntries()
	if err != nil {
		return out, err
	}
	for _, e := range list {
		if e.Type != model.EntryProductOverride && e.Type != model.EntryProductCustom {
			continue
		}
		if len(e.Payload) == 0 {
			continue
		}
		var p struct {
			ID   string          `json:"id"`
			Spec *model.ItemSpec `json:"spec"`
		}
		if err := json.Unmarshal(e.Payload, &p); err != nil || p.ID == "" || p.Spec == nil {
			continue
		}
		s := p.Spec
		out[p.ID] = &specBaseline{
			SKU: s.SKU, Category: s.Category, Group: s.Group,
			BaseSizeW: s.BaseSizeW, BaseSizeH: s.BaseSizeH, BaseSizeD: s.BaseSizeD,
			MaterialSku: s.MaterialSku, Craft: s.Craft, Packing: s.Packing,
			LaborMinutes: s.LaborMinutes, ScaleMin: s.ScaleMin, ScaleMax: s.ScaleMax,
			Drawings: s.Drawings,
		}
	}
	return out, nil
}

// composeSpec 组装下单瞬间冻结的规格快照。
// client 可能为 nil（老客户端）；base 可能为 nil（该商品尚未维护规格）。
func composeSpec(client *model.ItemSpec, base *specBaseline, scale float64) *model.ItemSpec {
	out := &model.ItemSpec{}

	// 非机密字段：基线优先，缺失时用客户端值兜底
	if base != nil {
		out.SKU, out.Category, out.Group = base.SKU, base.Category, base.Group
		out.BaseSizeW, out.BaseSizeH, out.BaseSizeD = base.BaseSizeW, base.BaseSizeH, base.BaseSizeD
	}
	if client != nil {
		if out.SKU == "" {
			out.SKU = client.SKU
		}
		if out.Category == "" {
			out.Category = client.Category
		}
		if out.Group == "" {
			out.Group = client.Group
		}
		if out.BaseSizeW == 0 {
			out.BaseSizeW = client.BaseSizeW
		}
		if out.BaseSizeH == 0 {
			out.BaseSizeH = client.BaseSizeH
		}
		if out.BaseSizeD == 0 {
			out.BaseSizeD = client.BaseSizeD
		}
		// 色号与客户所见一致（客户自己选的材质），三视图由客户端渲染
		out.ColorCode = client.ColorCode
		out.Views = client.Views
	}

	// 机密字段：只认服务端基线，客户端提交的一律忽略
	if base != nil {
		out.MaterialSku = base.MaterialSku
		out.Craft = base.Craft
		out.Packing = base.Packing
		out.LaborMinutes = base.LaborMinutes
		out.Drawings = base.Drawings
		out.ScaleMin, out.ScaleMax = base.ScaleMin, base.ScaleMax
	}

	// 实际毫米尺寸一律服务端重算，前端值不作数
	out.SizeWMM = toMM(out.BaseSizeW * scale)
	out.SizeHMM = toMM(out.BaseSizeH * scale)
	out.SizeDMM = toMM(out.BaseSizeD * scale)
	return out
}

// sanitizeEntries 未登录访问 /api/entries 时的公开视图：
// 剥掉 spec 里的工艺、包装、工时、主材编码与图纸清单，只留客户下单必需的型号与定制可行域。
// 返回的是副本，绝不修改存储中的原始负载。
func sanitizeEntries(list []*model.CatalogEntry) []*model.CatalogEntry {
	out := make([]*model.CatalogEntry, 0, len(list))
	for _, e := range list {
		cp := *e
		if trimmed, ok := sanitizePayload(e.Payload); ok {
			cp.Payload = trimmed
		}
		out = append(out, &cp)
	}
	return out
}

// sanitizePayload 裁剪负载中的 spec；未含 spec 或解析失败时原样返回 ok=false
func sanitizePayload(raw json.RawMessage) (json.RawMessage, bool) {
	if len(raw) == 0 {
		return nil, false
	}
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		return nil, false
	}
	spec, ok := m["spec"].(map[string]any)
	if !ok || len(spec) == 0 {
		return nil, false
	}
	pub := map[string]any{}
	for k, v := range spec {
		if publicSpecFields[k] {
			pub[k] = v
		}
	}
	m["spec"] = pub
	trimmed, err := json.Marshal(m)
	if err != nil {
		return nil, false
	}
	return trimmed, true
}
