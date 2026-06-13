export const defaultAdminPromotionExtConfigFields = [
  "id",
  "promotion_id",
  "auto_apply",
  "include_groups_combinator",
  "exclude_groups_combinator",
  "promotion_mode",
  "mode_config",
  "metadata",
  "created_at",
  "updated_at",
  "deleted_at",
  "rule_groups.id",
  "rule_groups.type",
  "rule_groups.promotion_config_id",
  "rule_groups.rules_combinator",
  "rule_groups.metadata",
  "rule_groups.created_at",
  "rule_groups.updated_at",
  "rule_groups.rules.id",
  "rule_groups.rules.rule_group_id",
  "rule_groups.rules.rule_type",
  "rule_groups.rules.config",
  "rule_groups.rules.metadata",
  "rule_groups.rules.created_at",
  "rule_groups.rules.updated_at",
]

export const retrieveTransformQueryConfig = {
  defaults: defaultAdminPromotionExtConfigFields,
  isList: false,
}

export const listTransformQueryConfig = {
  ...retrieveTransformQueryConfig,
  defaultLimit: 50,
  isList: true,
}
