export interface AdminCreatePromotionExtRulePayload {
  rule_group_id: string
  rule_type: string
  config: Record<string, unknown>
}

export interface AdminBatchCreatePromotionExtRulePayload {
  items: AdminCreatePromotionExtRulePayload[]
}

export interface AdminUpdatePromotionExtRulePayload {
  rule_type?: string
  config?: Record<string, unknown>
}

export interface AdminBatchUpdatePromotionExtRulePayload {
  items: (AdminUpdatePromotionExtRulePayload & { id: string })[]
}

export interface AdminBatchDeletePromotionExtRulePayload {
  ids: string[]
}
