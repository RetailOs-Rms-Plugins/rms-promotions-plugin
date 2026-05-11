export const defaultAdminPromotionExtRuleFields = [
  "id",
  "rule_group_id",
  "rule_type",
  "config",
  "created_at",
  "updated_at",
  "deleted_at",
]

export const retrieveTransformQueryConfig = {
  defaults: defaultAdminPromotionExtRuleFields,
  isList: false,
}

export const listTransformQueryConfig = {
  ...retrieveTransformQueryConfig,
  defaultLimit: 50,
  isList: true,
}
