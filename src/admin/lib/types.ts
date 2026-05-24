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
  | "totalQuantity"
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

export type Combinator = "and" | "or"

export type PromotionExtRuleGroup = {
  id: string
  promotion_config_id: string
  type: "include" | "exclude"
  rules_combinator: Combinator
  created_at: string
  updated_at: string
}

export type PromotionMode = "standard" | "bundle" | "buyget_repeat"

export type BundleModeConfig = {
  bundle_size: number
  bundle_price: number
  remainder: "full_price"
}

export type BuyGetRepeatModeConfig = {
  buy_quantity: number
  get_quantity: number
  discount_type: "percentage" | "fixed"
  discount_value: number
  discount_target: "cheapest"
  remainder: "full_price"
}

export type ModeConfig = BundleModeConfig | BuyGetRepeatModeConfig | null

export type PromotionExtConfig = {
  id: string
  promotion_id: string
  auto_apply: boolean
  include_groups_combinator: Combinator
  exclude_groups_combinator: Combinator
  promotion_mode: PromotionMode
  mode_config: ModeConfig
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
  rules_combinator: Combinator
  rules: RuleFormRow[]
}

export type RulesEditorFormValues = {
  auto_apply: boolean
  include_groups_combinator: Combinator
  rule_groups: RuleGroupFormRow[]
}
