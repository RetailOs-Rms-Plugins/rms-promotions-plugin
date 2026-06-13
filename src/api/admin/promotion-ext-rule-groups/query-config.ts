export const defaultAdminPromotionExtRuleGroupFields = [
  "id",
  "promotion_config_id",
  "type",
  "rules_combinator",
  "metadata",
  "created_at",
  "updated_at",
  "deleted_at",
]

export const retrieveTransformQueryConfig = {
  defaults: defaultAdminPromotionExtRuleGroupFields,
  isList: false,
}

export const listTransformQueryConfig = {
  ...retrieveTransformQueryConfig,
  defaultLimit: 50,
  isList: true,
}
