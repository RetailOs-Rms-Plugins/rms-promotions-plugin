import { PaginatedResponse } from "@medusajs/framework/types"

export interface AdminPromotionExtRuleGroup {
  id: string
  promotion_config_id: string
  type: "include" | "exclude"
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
}

export interface AdminPromotionExtRuleGroupResponse {
  promotion_ext_rule_group: AdminPromotionExtRuleGroup
}

export type AdminPromotionExtRuleGroupListResponse = PaginatedResponse<{
  promotion_ext_rule_groups: AdminPromotionExtRuleGroup[]
}>

export interface AdminPromotionExtRuleGroupsBatchResponse {
  promotion_ext_rule_groups: AdminPromotionExtRuleGroup[]
}

export interface AdminPromotionExtRuleGroupDeleteResponse {
  id: string
  object: "promotion_ext_rule_group"
  deleted: true
}

export interface AdminPromotionExtRuleGroupsBatchDeleteResponse {
  ids: string[]
  deleted: true
}
