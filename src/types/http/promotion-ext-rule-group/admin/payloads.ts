export interface AdminCreatePromotionExtRuleGroupPayload {
  promotion_config_id: string
  type: "include" | "exclude"
}

export interface AdminBatchCreatePromotionExtRuleGroupPayload {
  items: AdminCreatePromotionExtRuleGroupPayload[]
}

export interface AdminUpdatePromotionExtRuleGroupPayload {
  type?: "include" | "exclude"
}

export interface AdminBatchUpdatePromotionExtRuleGroupPayload {
  items: (AdminUpdatePromotionExtRuleGroupPayload & { id: string })[]
}

export interface AdminBatchDeletePromotionExtRuleGroupPayload {
  ids: string[]
}
