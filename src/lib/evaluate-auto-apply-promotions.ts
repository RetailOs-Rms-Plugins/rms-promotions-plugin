/**
 * Evaluate auto-apply promotions and add/remove them from the cart.
 *
 * This function checks all promotion ext configs with `auto_apply: true`,
 * evaluates their rules (native + ext) against the current cart state,
 * and adds or removes promotions accordingly via updateCartPromotionsWorkflow.
 *
 * ## Where this function is called
 *
 * 1. **Custom store route overrides** (synchronous, before response)
 *    The add/update/delete line-item routes call this AFTER the main
 *    workflow completes and releases its lock. This ensures the API
 *    response includes auto-applied promotions immediately.
 *
 * 2. **cart.updated subscriber** (async fallback)
 *    As a safety net for any cart mutation path not covered by route
 *    overrides (e.g., shipping method changes, customer assignment).
 *
 * ## Important: Do NOT call this from a workflow hook
 *
 * This function calls updateCartPromotionsWorkflow via .run() (standalone
 * invocation). Standalone invocations attempt to acquire the cart lock.
 * If a parent workflow still holds the lock, this will deadlock.
 *
 * Medusa's lock-skip mechanism (StepResponse.skip() in acquireLockStep)
 * only applies to .runAsStep() calls (sub-workflow composition), NOT to
 * .run() calls. Hooks use .run(), so calling this from a workflow hook
 * deadlocks. See ADR-0002 for the full investigation.
 */

import { updateCartPromotionsWorkflow } from "@medusajs/medusa/core-flows"
import { ContainerRegistrationKeys, PromotionActions } from "@medusajs/framework/utils"
import { PROMOTION_EXT_MODULE } from "../modules/promotion-ext"
import type PromotionExtModuleService from "../modules/promotion-ext/service"
import { evaluatePromotion } from "./rule-evaluator"
import { buildEnrichedCart, loadConfigShape, passesNativeRules } from "./cart-enricher"

export interface AutoApplyResult {
  added: string[]
  removed: string[]
}

const autoApplyLocks = new Map<string, Promise<AutoApplyResult>>()

function withAutoApplyLock(cartId: string, fn: () => Promise<AutoApplyResult>): Promise<AutoApplyResult> {
  const noop: AutoApplyResult = { added: [], removed: [] }
  const chain = (autoApplyLocks.get(cartId) ?? Promise.resolve(noop)).then(fn, fn)
  autoApplyLocks.set(cartId, chain)
  chain.finally(() => {
    if (autoApplyLocks.get(cartId) === chain) autoApplyLocks.delete(cartId)
  })
  return chain
}

export function evaluateAutoApplyPromotions(
  cartId: string,
  container: any
): Promise<AutoApplyResult> {
  return withAutoApplyLock(cartId, () => evaluateAutoApplyPromotionsInner(cartId, container))
}

async function evaluateAutoApplyPromotionsInner(
  cartId: string,
  container: any
): Promise<AutoApplyResult> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const service: PromotionExtModuleService = container.resolve(PROMOTION_EXT_MODULE)

  const autoApplyConfigs = await service.listPromotionExtConfigs({ auto_apply: true })
  if (!autoApplyConfigs.length) return { added: [], removed: [] }

  const promotionIds = autoApplyConfigs.map((c) => c.promotion_id)

  const { data: cartList } = await query.graph({
    entity: "cart",
    fields: [
      "id",
      "region_id",
      "sales_channel_id",
      "currency_code",
      "customer_id",
      "items.quantity",
      "items.product_id",
      "items.product.collection_id",
      "customer.id",
      "customer.groups.id",
      "promotions.code",
    ],
    filters: { id: cartId },
  })

  const cart = cartList[0]
  if (!cart) return { added: [], removed: [] }

  const appliedCodes = new Set<string>((cart?.promotions ?? []).map((p: any) => p.code))

  const { data: promotions } = await query.graph({
    entity: "promotion",
    fields: [
      "id",
      "code",
      "status",
      "starts_at",
      "ends_at",
      "rules.attribute",
      "rules.operator",
      "rules.values.value",
    ],
    filters: { id: promotionIds },
  })

  const now = new Date()
  const toAdd: string[] = []
  const toRemove: string[] = []

  for (const promotion of promotions) {
    const configShape = await loadConfigShape(promotion.id, container)
    if (!configShape) continue

    const isActive =
      promotion.status === "active" &&
      (!promotion.starts_at || new Date(promotion.starts_at) <= now) &&
      (!promotion.ends_at || new Date(promotion.ends_at) >= now) &&
      passesNativeRules(promotion, cart)

    if (!isActive) {
      toRemove.push(promotion.code)
      continue
    }

    const enrichedCart = await buildEnrichedCart(cartId, promotion.id, configShape, container)
    const passes = evaluatePromotion(configShape, enrichedCart)

    if (passes) {
      toAdd.push(promotion.code)
    } else {
      toRemove.push(promotion.code)
    }
  }

  const actualToAdd = toAdd.filter((code) => !appliedCodes.has(code))
  const actualToRemove = toRemove.filter((code) => appliedCodes.has(code))

  if (actualToAdd.length) {
    await updateCartPromotionsWorkflow(container).run({
      input: { cart_id: cartId, promo_codes: actualToAdd, action: PromotionActions.ADD },
    })
  }

  if (actualToRemove.length) {
    await updateCartPromotionsWorkflow(container).run({
      input: { cart_id: cartId, promo_codes: actualToRemove, action: PromotionActions.REMOVE },
    })
  }

  return { added: actualToAdd, removed: actualToRemove }
}
