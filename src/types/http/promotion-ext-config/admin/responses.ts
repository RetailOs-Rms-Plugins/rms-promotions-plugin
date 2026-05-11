import { PaginatedResponse } from "@medusajs/framework/types"

export interface AdminPromotionExtConfig {
  id: string
  promotion_id: string
  auto_apply: boolean
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
}

export interface AdminPromotionExtConfigResponse {
  promotion_ext_config: AdminPromotionExtConfig
}

export type AdminPromotionExtConfigListResponse = PaginatedResponse<{
  promotion_ext_configs: AdminPromotionExtConfig[]
}>

export interface AdminPromotionExtConfigsBatchResponse {
  promotion_ext_configs: AdminPromotionExtConfig[]
}

export interface AdminPromotionExtConfigDeleteResponse {
  id: string
  object: "promotion_ext_config"
  deleted: true
}

export interface AdminPromotionExtConfigsBatchDeleteResponse {
  ids: string[]
  deleted: true
}
