export const defaultAdminRmsPromotionConfigFields = [
  "id",
  "promotion_id",
  "rms_auto_apply",
  "created_at",
  "updated_at",
  "deleted_at",
]

export const retrieveTransformQueryConfig = {
  defaults: defaultAdminRmsPromotionConfigFields,
  isList: false,
}

export const listTransformQueryConfig = {
  ...retrieveTransformQueryConfig,
  defaultLimit: 50,
  isList: true,
}
