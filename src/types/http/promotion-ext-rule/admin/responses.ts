import { PaginatedResponse } from "@medusajs/framework/types"

export interface AdminPromotionExtRule {
  id: string
  rule_group_id: string
  rule_type: string
  config: Record<string, unknown>
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
}

export interface AdminPromotionExtRuleResponse {
  promotion_ext_rule: AdminPromotionExtRule
}

export type AdminPromotionExtRuleListResponse = PaginatedResponse<{
  promotion_ext_rules: AdminPromotionExtRule[]
}>

export interface AdminPromotionExtRulesBatchResponse {
  promotion_ext_rules: AdminPromotionExtRule[]
}

export interface AdminPromotionExtRuleDeleteResponse {
  id: string
  object: "promotion_ext_rule"
  deleted: true
}

export interface AdminPromotionExtRulesBatchDeleteResponse {
  ids: string[]
  deleted: true
}
