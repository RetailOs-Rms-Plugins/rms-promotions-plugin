import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

/**
 * Corrects native Medusa promotion adjustments after tier repricing changes the item price.
 *
 * Medusa calculates promo adjustments using the original variant price, before our hook fires.
 * By the time we reprice items via quantity tiers, the adjustments are already wrong.
 * This function patches them:
 * - Percentage promos: recalculates amount using the current (repriced) unit_price.
 * - Fixed-amount promos: caps the amount at unit_price × quantity if the discount exceeds the repriced subtotal.
 *
 * Must run **after** `repriceCartByQuantityTiers` and **before** `computeNonStandardAdjustments`.
 * Only touches native Medusa adjustments (promotion_id present, provider_id absent).
 * Bundle/buy-get adjustments are not on the cart yet at this point — they are safe.
 *
 * @see ADR-0010, docs/BUG-native-promo-ignores-tier-repricing.md
 */
export async function recalcStandardAdjustments(
  cartId: string,
  container: any
): Promise<void> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const cartModule = container.resolve(Modules.CART)

  const fullCart = await cartModule.retrieveCart(cartId, {
    relations: ["items.adjustments"],
  })

  const items = fullCart.items ?? []
  const allAdjustments = items.flatMap((item: any) =>
    (item.adjustments ?? []).map((adj: any) => ({ ...adj, _item: item }))
  )

  const promoAdjustments = allAdjustments.filter(
    (adj: any) => adj.promotion_id && adj.provider_id == null
  )
  if (!promoAdjustments.length) return

  const promoIds = [...new Set(promoAdjustments.map((a: any) => a.promotion_id))]

  const { data: promotions } = await query.graph({
    entity: "promotion",
    fields: ["id", "application_method.type", "application_method.value"],
    filters: { id: promoIds },
  })

  const percentagePromos = new Map<string, number>()
  const fixedPromos = new Set<string>()
  for (const promo of promotions) {
    if (promo.application_method?.type === "percentage") {
      percentagePromos.set(promo.id, Number(promo.application_method.value))
    } else if (promo.application_method?.type === "fixed") {
      fixedPromos.add(promo.id)
    }
  }

  if (!percentagePromos.size && !fixedPromos.size) return

  const updates: { id: string; amount: number }[] = []

  for (const adj of promoAdjustments) {
    const item = adj._item
    const unitPrice = Number(item.unit_price)
    const quantity = Number(item.quantity)
    const itemSubtotal = unitPrice * quantity

    const percentage = percentagePromos.get(adj.promotion_id)
    if (percentage != null) {
      const correctAmount = (percentage / 100) * itemSubtotal
      if (correctAmount !== adj.amount) {
        updates.push({ id: adj.id, amount: correctAmount })
      }
      continue
    }

    if (fixedPromos.has(adj.promotion_id) && adj.amount > itemSubtotal) {
      updates.push({ id: adj.id, amount: itemSubtotal })
    }
  }

  if (updates.length) {
    await cartModule.updateLineItemAdjustments(cartId, updates)
  }
}
