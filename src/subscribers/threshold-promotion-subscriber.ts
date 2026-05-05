import { SubscriberArgs, type SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys, PromotionActions } from "@medusajs/framework/utils"
import { updateCartPromotionsWorkflow } from "@medusajs/medusa/core-flows"
import { computeThresholdChanges } from "../workflows/steps/compute-threshold-changes"

export function calculateCartSubtotal(
  items: Array<{ unit_price: number; quantity: number }>
): number {
  return items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0)
}

export default async function thresholdPromotionSubscriber({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data: carts } = await query.graph({
    entity: "cart",
    fields: [
      "id",
      "currency_code",
      "items.id",
      "items.unit_price",
      "items.quantity",
      "promotions.id",
    ],
    filters: { id: [data.id] },
  })

  const cart = carts[0]
  if (!cart) return

  const cartSubtotal = calculateCartSubtotal((cart as any).items ?? [])
  const appliedPromotionIds = ((cart as any).promotions ?? []).map((p: any) => p.id)

  const { data: promotions } = await query.graph({
    entity: "promotion",
    fields: [
      "id",
      "code",
      "is_automatic",
      "application_method.currency_code",
      "threshold_rule.id",
      "threshold_rule.min_cart_subtotal",
    ],
    filters: { is_automatic: true },
  })

  const thresholdPromotions = promotions
    .filter(
      (p: any) =>
        p.threshold_rule &&
        p.application_method?.currency_code === (cart as any).currency_code
    )
    .map((p: any) => ({
      promotionId: p.id,
      code: p.code,
      minCartSubtotal: p.threshold_rule.min_cart_subtotal,
    }))

  if (!thresholdPromotions.length) return

  const { toAdd, toRemove } = computeThresholdChanges({
    cartSubtotal,
    appliedPromotionIds,
    thresholdPromotions,
  })

  if (toAdd.length > 0) {
    await updateCartPromotionsWorkflow(container).run({
      input: {
        cart_id: data.id,
        promo_codes: toAdd,
        action: PromotionActions.ADD,
      },
    })
  }

  if (toRemove.length > 0) {
    await updateCartPromotionsWorkflow(container).run({
      input: {
        cart_id: data.id,
        promo_codes: toRemove,
        action: PromotionActions.REMOVE,
      },
    })
  }
}

export const config: SubscriberConfig = {
  event: "cart.updated",
}
