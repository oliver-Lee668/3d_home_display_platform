// 构建期角色：决定本产物面向谁。
//   user       = 客户展示端（浏览/定制/下单/查单，不含任何管理台入口）
//   sales      = 销售确认台（仅销售界面）
//   production = 生产确认台（仅生产界面）
// 由 VITE_APP_ROLE 注入（.env.user / .env.sales / .env.factory），三种产物分别部署到不同 URL/域名。
export type AppRole = 'user' | 'sales' | 'production'

const raw = ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_APP_ROLE ||
  'user') as AppRole

export const APP_ROLE: AppRole = raw === 'sales' || raw === 'production' ? raw : 'user'

/** 是否为内部员工端（销售/生产） */
export const IS_STAFF: boolean = APP_ROLE !== 'user'
