export type ThresholdPromotion = {
  threshold_rule: {
    id: string
    min_cart_subtotal: number
  }
  promotion: {
    id: string
    code: string
    is_automatic: boolean
    status: string
    application_method: {
      type: "fixed" | "percentage"
      value: number
      currency_code: string
    } | null
    campaign_id: string | null
  }
}

export type ThresholdPromotionsResponse = {
  threshold_promotions: ThresholdPromotion[]
  count: number
  offset: number
  limit: number
}

export type RuleField =
  | "subtotal"
  | "quantity"
  | "quantityOfProduct"
  | "quantityOfCollection"
  | "usesPerCustomer"
  | "firstOrder"

export type RuleOperator = "eq" | "neq" | "gt" | "gte" | "lt" | "lte"

export type ComparisonRuleConfig = {
  field: RuleField
  operator: RuleOperator
  value: number | string | string[] | boolean
  scope?: {
    product_id?: string
    collection_id?: string
  }
}

export type PromotionExtRule = {
  id: string
  rule_group_id: string
  rule_type: string
  config: ComparisonRuleConfig
  created_at: string
  updated_at: string
}

export type PromotionExtRuleGroup = {
  id: string
  promotion_config_id: string
  type: "include" | "exclude"
  created_at: string
  updated_at: string
}

export type PromotionExtConfig = {
  id: string
  promotion_id: string
  auto_apply: boolean
  created_at: string
  updated_at: string
  rule_groups?: (PromotionExtRuleGroup & { rules: PromotionExtRule[] })[]
}

export type RuleGroupWithRules = PromotionExtRuleGroup & {
  rules: PromotionExtRule[]
}

export type PromotionExtData = {
  config: PromotionExtConfig | null
  groupsWithRules: RuleGroupWithRules[]
}

export type RuleFormRow = {
  rule_type: "comparison"
  config: ComparisonRuleConfig
}

export type RuleGroupFormRow = {
  type: "include" | "exclude"
  rules: RuleFormRow[]
}

export type RulesEditorFormValues = {
  auto_apply: boolean
  rule_groups: RuleGroupFormRow[]
}
