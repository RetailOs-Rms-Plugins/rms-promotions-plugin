import { model } from "@medusajs/framework/utils"
import { CART_EXT_ADJUSTMENT_MODEL } from "../constants"

export const CartExtAdjustment = model.define(CART_EXT_ADJUSTMENT_MODEL, {
  id: model.id({ prefix: "cea" }).primaryKey(),
  description: model.text().nullable(),
  promotion_id: model.text().nullable(),
  code: model.text().nullable(),
  amount: model.bigNumber(),
  provider_id: model.text().nullable(),
  metadata: model.json().nullable(),
  item_id: model.text().nullable(),
  is_tax_inclusive: model.boolean().default(false),
  cart_id: model.text(),
  source: model.text(),
})
