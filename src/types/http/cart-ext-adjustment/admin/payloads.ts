export interface AdminCreateCartExtAdjustmentPayload {
  item_id: string
  amount: number
  description?: string
  is_tax_inclusive?: boolean
}

export interface AdminBatchCreateCartExtAdjustmentPayload {
  items: AdminCreateCartExtAdjustmentPayload[]
}

export interface AdminUpdateCartExtAdjustmentPayload {
  amount?: number
  description?: string
  is_tax_inclusive?: boolean
}

export interface AdminBatchUpdateCartExtAdjustmentPayload {
  items: (AdminUpdateCartExtAdjustmentPayload & { id: string })[]
}

export interface AdminBatchDeleteCartExtAdjustmentPayload {
  ids: string[]
}
