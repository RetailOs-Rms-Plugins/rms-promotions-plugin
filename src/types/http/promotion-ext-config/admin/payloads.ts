export interface AdminCreatePromotionExtConfigPayload {
  promotion_id: string
  auto_apply?: boolean
  promotion_mode?: string
  mode_config?: Record<string, unknown> | null
}

export interface AdminBatchCreatePromotionExtConfigPayload {
  items: AdminCreatePromotionExtConfigPayload[]
}

export interface AdminUpdatePromotionExtConfigPayload {
  auto_apply?: boolean
  promotion_mode?: string
  mode_config?: Record<string, unknown> | null
}

export interface AdminBatchUpdatePromotionExtConfigPayload {
  items: (AdminUpdatePromotionExtConfigPayload & { id: string })[]
}

export interface AdminBatchDeletePromotionExtConfigPayload {
  ids: string[]
}
