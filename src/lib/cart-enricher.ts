import type { PromotionExtConfigShape, EnrichedCart } from "./rule-evaluator"

function needsField(config: PromotionExtConfigShape, field: string): boolean {
  return config.rule_groups.some((g) =>
    g.rules.some((r) => r.rule_type === "comparison" && (r.config as any).field === field)
  )
}

function safeNumber(val: unknown): number {
  if (typeof val === "number") return val
  if (val != null && typeof (val as any).toNumber === "function") return (val as any).toNumber()
  return Number(val) || 0
}

export async function buildEnrichedCart(
  cartId: string,
  promotionId: string,
  config: PromotionExtConfigShape,
  container: any
): Promise<EnrichedCart> {
  const query = container.resolve("query")

  const { data: carts } = await query.graph({
    entity: "cart",
    fields: [
      "id",
      "customer_id",
      "items.quantity",
      "items.unit_price",
      "items.product_id",
      "items.product.collection_id",
    ],
    filters: { id: cartId },
  })

  const cart = carts[0]

  const items = (cart?.items ?? []).map((item: any) => ({
    product_id: item.product_id,
    totalQuantity: item.quantity as number,
    unit_price: safeNumber(item.unit_price),
    product_collection_id: item.product?.collection_id as string | undefined,
  }))

  const enriched: EnrichedCart = {
    subtotal: items.reduce((sum, i) => sum + i.unit_price * i.totalQuantity, 0),
    totalQuantity: items.reduce((sum, i) => sum + i.totalQuantity, 0),
    items,
    customer_id: cart?.customer_id ?? undefined,
  }

  if (!enriched.customer_id) return enriched

  if (needsField(config, "usesPerCustomer")) {
    const { data: orders } = await query.graph({
      entity: "order",
      fields: ["id", "promotions.id"],
      filters: {
        customer_id: enriched.customer_id,
        status: { $nin: ["canceled", "refunded"] },
      },
    })
    enriched.usesPerCustomer = orders.filter((o: any) =>
      o.promotions?.some((p: any) => p.id === promotionId)
    ).length
  }

  if (needsField(config, "firstOrder")) {
    const { data: orders } = await query.graph({
      entity: "order",
      fields: ["id"],
      filters: {
        customer_id: enriched.customer_id,
        status: { $nin: ["canceled", "refunded"] },
      },
    })
    enriched.firstOrder = orders.length === 0
  }

  return enriched
}

export async function loadConfigShape(
  promotionId: string,
  container: any
): Promise<PromotionExtConfigShape | null> {
  const query = container.resolve("query")

  const { data: configs } = await query.graph({
    entity: "promotion_ext_config",
    fields: [
      "id",
      "include_groups_combinator",
      "exclude_groups_combinator",
      "rule_groups.type",
      "rule_groups.rules_combinator",
      "rule_groups.rules.rule_type",
      "rule_groups.rules.config",
    ],
    filters: { promotion_id: promotionId },
  })

  if (!configs[0]) return null

  return {
    include_groups_combinator: configs[0].include_groups_combinator ?? "or",
    exclude_groups_combinator: configs[0].exclude_groups_combinator ?? "or",
    rule_groups: (configs[0].rule_groups ?? []).map((g: any) => ({
      type: g.type,
      rules_combinator: g.rules_combinator ?? "and",
      rules: (g.rules ?? []).map((r: any) => ({
        rule_type: r.rule_type,
        config: r.config,
      })),
    })),
  }
}

export function passesNativeRules(promotion: any, cart: any): boolean {
  const rules: any[] = promotion.rules ?? []
  for (const rule of rules) {
    const values: string[] = (rule.values ?? []).map((v: any) => v.value)
    switch (rule.attribute) {
      case "region_id":
        if (!values.includes(cart.region_id)) return false
        break
      case "sales_channel_id":
        if (!values.includes(cart.sales_channel_id)) return false
        break
      case "currency_code":
        if (!values.includes(cart.currency_code)) return false
        break
      case "customer_group_id": {
        const cartGroups: string[] = (cart.customer?.groups ?? []).map((g: any) => g.id)
        if (!values.some((v) => cartGroups.includes(v))) return false
        break
      }
    }
  }
  return true
}
