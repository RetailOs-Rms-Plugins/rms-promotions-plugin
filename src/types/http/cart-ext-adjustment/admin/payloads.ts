import { MetadataType } from "@medusajs/framework/types"

export interface AdminCreateCartExtAdjustmentPayload {
  item_id?: string | null
  amount: number
  description?: string
  is_tax_inclusive?: boolean
  metadata?: MetadataType
}

export interface AdminBatchCreateCartExtAdjustmentPayload {
  items: AdminCreateCartExtAdjustmentPayload[]
}

export interface AdminUpdateCartExtAdjustmentPayload {
  amount?: number
  description?: string
  is_tax_inclusive?: boolean
  metadata?: MetadataType
}

export interface AdminBatchUpdateCartExtAdjustmentPayload {
  items: (AdminUpdateCartExtAdjustmentPayload & { id: string })[]
}

export interface AdminBatchDeleteCartExtAdjustmentPayload {
  ids: string[]
}
