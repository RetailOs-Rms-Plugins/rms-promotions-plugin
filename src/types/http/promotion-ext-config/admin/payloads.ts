export interface AdminCreatePromotionExtConfigPayload {
  promotion_id: string
  auto_apply?: boolean
}

export interface AdminBatchCreatePromotionExtConfigPayload {
  items: AdminCreatePromotionExtConfigPayload[]
}

export interface AdminUpdatePromotionExtConfigPayload {
  auto_apply?: boolean
}

export interface AdminBatchUpdatePromotionExtConfigPayload {
  items: (AdminUpdatePromotionExtConfigPayload & { id: string })[]
}

export interface AdminBatchDeletePromotionExtConfigPayload {
  ids: string[]
}
