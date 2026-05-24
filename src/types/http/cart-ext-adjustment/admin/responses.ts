import { PaginatedResponse } from "@medusajs/framework/types"

export interface AdminCartExtAdjustment {
  id: string
  description: string | null
  promotion_id: string | null
  code: string | null
  amount: number
  provider_id: string | null
  metadata: Record<string, unknown> | null
  item_id: string | null
  is_tax_inclusive: boolean
  cart_id: string
  source: string
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
}

export interface AdminCartExtAdjustmentResponse {
  cart_ext_adjustment: AdminCartExtAdjustment
}

export type AdminCartExtAdjustmentListResponse = PaginatedResponse<{
  cart_ext_adjustments: AdminCartExtAdjustment[]
}>

export interface AdminCartExtAdjustmentDeleteResponse {
  id: string
  object: "cart_ext_adjustment"
  deleted: true
}

export interface AdminCartExtAdjustmentsBatchResponse {
  cart_ext_adjustments: AdminCartExtAdjustment[]
}

export interface AdminCartExtAdjustmentsBatchDeleteResponse {
  ids: string[]
  deleted: true
}
