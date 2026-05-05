import { updateCartPromotionsWorkflow } from "@medusajs/medusa/core-flows"
import { MedusaError } from "@medusajs/framework/utils"
import { PromotionActions } from "@medusajs/framework/utils"

export type PromotionThresholdRule = {
  code: string
  minCartSubtotal: number
  currencyCode: string
}

export function findThresholdViolations({
  cartSubtotal,
  promotionsWithThresholds,
}: {
  cartSubtotal: number
  promotionsWithThresholds: PromotionThresholdRule[]
}): PromotionThresholdRule[] {
  return promotionsWithThresholds.filter(
    (promo) => cartSubtotal < promo.minCartSubtotal
  )
}

updateCartPromotionsWorkflow.hooks.validate(
  async ({ input }, { container }) => {
    const { cart_id, promo_codes, action } = input
    if (action === PromotionActions.REMOVE) {
      return
    }

    if (!promo_codes?.length) {
      return
    }

    const query = container.resolve("query")

    const { data: promotions } = await query.graph({
      entity: "promotion",
      fields: ["id", "code", "threshold_rule.min_cart_subtotal", "threshold_rule.id"],
      filters: { code: promo_codes },
    })

    const promotionsWithThresholds: PromotionThresholdRule[] = promotions
      .filter((p: any) => p.threshold_rule)
      .map((p: any) => ({
        code: p.code,
        minCartSubtotal: p.threshold_rule.min_cart_subtotal,
        currencyCode: "",
      }))

    if (!promotionsWithThresholds.length) {
      return
    }

    const { data: carts } = await query.graph({
      entity: "cart",
      fields: ["id", "items.id", "items.unit_price", "items.quantity"],
      filters: { id: cart_id },
    })

    const cart = carts[0]
    const cartSubtotal = cart?.items?.reduce(
      (sum: number, item: any) => sum + item.unit_price * item.quantity,
      0
    ) ?? 0

    const violations = findThresholdViolations({ cartSubtotal, promotionsWithThresholds })

    if (violations.length > 0) {
      const v = violations[0]
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `Cart subtotal must be at least ${v.minCartSubtotal} to use promotion ${v.code}`
      )
    }
  }
)
