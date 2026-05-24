export const defaultAdminCartExtAdjustmentFields = [
  "id",
  "description",
  "promotion_id",
  "code",
  "amount",
  "raw_amount",
  "provider_id",
  "metadata",
  "item_id",
  "is_tax_inclusive",
  "cart_id",
  "source",
  "created_at",
  "updated_at",
  "deleted_at",
]

export const retrieveTransformQueryConfig = {
  defaults: defaultAdminCartExtAdjustmentFields,
  isList: false,
}

export const listTransformQueryConfig = {
  ...retrieveTransformQueryConfig,
  defaultLimit: 50,
  isList: true,
}
