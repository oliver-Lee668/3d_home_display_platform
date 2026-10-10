// 目录条目：销售端对商品库/地板的增删改以条目形式持久化，用户端拉取后与内置基线合并
package model

import (
	"encoding/json"
	"time"
)

// EntryType 条目类型
type EntryType string

const (
	// EntryProductOverride 覆盖内置商品（替换模型/改价/改名等），payload=Partial<Product>，需含 id
	EntryProductOverride EntryType = "product_override"
	// EntryProductCustom 新增商品（通常为上传的 glTF），payload=完整 Product
	EntryProductCustom EntryType = "product_custom"
	// EntryProductDisable 下架内置商品，entryId=商品id，payload 可空
	EntryProductDisable EntryType = "product_disable"
	// EntryFloorCustom 新增地板（上传图），payload=FloorFinish
	EntryFloorCustom EntryType = "floor_custom"
	// EntryFloorDisable 下架内置地板，entryId=地板id
	EntryFloorDisable EntryType = "floor_disable"
)

// CatalogEntry 一条目录变更
type CatalogEntry struct {
	EntryID   string          `json:"entryId"`
	Type      EntryType       `json:"type"`
	Payload   json.RawMessage `json:"payload,omitempty"`
	CreatedAt time.Time       `json:"createdAt"`
	UpdatedAt time.Time       `json:"updatedAt"`
}
