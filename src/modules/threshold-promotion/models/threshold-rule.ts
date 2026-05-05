import { model } from "@medusajs/framework/utils"

const ThresholdRule = model.define("threshold_rule", {
  id: model.id().primaryKey(),
  min_cart_subtotal: model.number(),
})

export default ThresholdRule
