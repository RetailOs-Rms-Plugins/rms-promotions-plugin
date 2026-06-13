import { MetadataType } from "@medusajs/framework/types"

export interface AdminCreatePromotionExtRuleGroupPayload {
  promotion_config_id: string
  type: "include" | "exclude"
  metadata?: MetadataType
}

export interface AdminBatchCreatePromotionExtRuleGroupPayload {
  items: AdminCreatePromotionExtRuleGroupPayload[]
}

export interface AdminUpdatePromotionExtRuleGroupPayload {
  type?: "include" | "exclude"
  metadata?: MetadataType
}

export interface AdminBatchUpdatePromotionExtRuleGroupPayload {
  items: (AdminUpdatePromotionExtRuleGroupPayload & { id: string })[]
}

export interface AdminBatchDeletePromotionExtRuleGroupPayload {
  ids: string[]
}
