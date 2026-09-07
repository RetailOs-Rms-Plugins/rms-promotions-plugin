/**
 * Integration test: a manually entered coupon code must still discount lines
 * that already carry a non-standard (bundle / buy-get) promotion.
 *
 * Reproduces haturki (Asana 1217457334283775). Cart shape is taken from the
 * measured cart_01M05AGMYFNATQ1CEKA4MEEK9G: a wine line at 69 x 2 carrying a
 * "2 for 129.90" promotion, plus a typed 50%-of-order coupon.
 *
 * ADR-0009 covers the same budget contamination for *auto-apply* standard
 * promotions. `restoreEvictedStandardPromos` lists only
 * `listPromotionExtConfigs({ auto_apply: true })`, so a typed coupon is never
 * rescued: Medusa's shared budget map is already drained by the bundle
 * promotion's native `application_method.value` (129.90) by the time the
 * coupon is computed, and nothing puts the coupon back.
 *
 * Expected coupon amount follows the behaviour the plugin already gives an
 * auto-apply percentage promotion: computed on a clean budget, then scaled by
 * the bundle's remaining fraction, which works out to 50% of the bundle price.
 *
 * Run: scripts/ or see the loop script — TEST_TYPE=integration:http
 *      jest --runInBand integration-tests/http/manual-coupon-starved-by-bundle.spec.ts
 */

import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  Modules,
  ContainerRegistrationKeys,
  PromotionActions,
} from "@medusajs/framework/utils"
import { updateCartPromotionsWorkflowId } from "@medusajs/core-flows"
import { PROMOTION_EXT_MODULE } from "../../src/modules/promotion-ext"
import type PromotionExtModuleService from "../../src/modules/promotion-ext/service"

jest.setTimeout(600 * 1000)

const UNIT_PRICE = 69
const QUANTITY = 2
const LINE_SUBTOTAL = UNIT_PRICE * QUANTITY // 138
const BUNDLE_PRICE = 129.9
const BUNDLE_SAVING = LINE_SUBTOTAL - BUNDLE_PRICE // 8.10
const COUPON_PERCENTAGE = 50
// The plugin computes an auto-apply percentage promo on a clean budget and then
// scales it by the share of the line the bundle did not consume, which is the
// same as taking the percentage off the bundle price.
const EXPECTED_COUPON = (BUNDLE_PRICE * COUPON_PERCENTAGE) / 100 // 64.95

medusaIntegrationTestRunner({
  testSuite: ({ getContainer }) => {
    let bundlePromoId: string
    let bundleCode: string
    let couponPromoId: string
    let couponCode: string
    let regionId: string
    let currencyCode: string
    let variantId: string
    let salesChannelId: string

    const sumAdjustments = (cart: any, promotionId: string) =>
      (cart.items ?? [])
        .flatMap((i: any) => i.adjustments ?? [])
        .filter((a: any) => a.promotion_id === promotionId)
        .reduce((sum: number, a: any) => sum + Number(a.amount), 0)

    const fetchCart = async (cartId: string) => {
      const query = getContainer().resolve(ContainerRegistrationKeys.QUERY)
      const { data } = await query.graph({
        entity: "cart",
        fields: [
          "id",
          "promotions.id",
          "promotions.code",
          "items.id",
          "items.unit_price",
          "items.quantity",
          "items.adjustments.code",
          "items.adjustments.amount",
          "items.adjustments.promotion_id",
        ],
        filters: { id: cartId },
      })
      return data[0]
    }

    const newCartWithWine = async (quantity: number) => {
      const container = getContainer()
      const cartModule = container.resolve(Modules.CART)
      const cart = await cartModule.createCarts({
        region_id: regionId,
        currency_code: currencyCode,
        sales_channel_id: salesChannelId,
      })

      const we = container.resolve(Modules.WORKFLOW_ENGINE)
      await we.run("add-to-cart", {
        input: {
          cart_id: cart.id,
          items: [{ variant_id: variantId, quantity }],
        },
      })
      return cart.id
    }

    // Exactly what the store route does for POST /store/carts/:id/promotions.
    const applyCouponLikeTheRoute = async (cartId: string) => {
      const container = getContainer()
      const we = container.resolve(Modules.WORKFLOW_ENGINE)
      const {
        computeNonStandardAdjustments,
      } = require("../../src/lib/compute-non-standard-adjustments")

      await we.run(updateCartPromotionsWorkflowId, {
        input: {
          promo_codes: [couponCode],
          cart_id: cartId,
          action: PromotionActions.ADD,
          force_refresh_payment_collection: true,
        },
      })
      await computeNonStandardAdjustments(cartId, container)
    }

    const settleAutoApplyPromos = async (cartId: string) => {
      const container = getContainer()
      const {
        evaluateAutoApplyPromotions,
      } = require("../../src/lib/evaluate-auto-apply-promotions")
      const {
        computeNonStandardAdjustments,
      } = require("../../src/lib/compute-non-standard-adjustments")

      await evaluateAutoApplyPromotions(cartId, container)
      await computeNonStandardAdjustments(cartId, container)
    }

    beforeAll(async () => {
      const container = getContainer()
      const query = container.resolve(ContainerRegistrationKeys.QUERY)

      const { data: regions } = await query.graph({
        entity: "region",
        fields: ["id", "currency_code"],
      })
      if (regions.length) {
        regionId = regions[0].id
        currencyCode = regions[0].currency_code
      } else {
        const regionModule = container.resolve(Modules.REGION)
        const region = await regionModule.createRegions({
          name: "Test",
          currency_code: "eur",
          countries: ["de"],
        })
        regionId = region.id
        currencyCode = "eur"
      }

      const { data: channels } = await query.graph({
        entity: "sales_channel",
        fields: ["id"],
      })
      salesChannelId = channels[0]?.id

      const productModule = container.resolve(Modules.PRODUCT)
      const product = await productModule.createProducts({
        title: "Test Wine",
        options: [{ title: "Size", values: ["750ml"] }],
        variants: [
          {
            title: "750ml",
            prices: [{ amount: UNIT_PRICE, currency_code: currencyCode }],
            options: { Size: "750ml" },
          },
        ],
      })
      variantId = product.variants[0].id

      if (salesChannelId) {
        const remoteLink = container.resolve(ContainerRegistrationKeys.LINK)
        await remoteLink.create({
          [Modules.PRODUCT]: { product_id: product.id },
          [Modules.SALES_CHANNEL]: { sales_channel_id: salesChannelId },
        })
      }

      const promotionModule = container.resolve(Modules.PROMOTION)

      // "2 for 129.90" — the native value (129.90) exceeds the unit price, so
      // Medusa's budget map treats it as draining the whole line.
      bundleCode = `BUNDLE2FOR12990_${Date.now()}`
      const bundlePromo = await promotionModule.createPromotions({
        code: bundleCode,
        type: "standard",
        status: "active",
        is_automatic: false,
        application_method: {
          type: "fixed",
          target_type: "items",
          value: BUNDLE_PRICE,
          currency_code: currencyCode,
          allocation: "once",
          max_quantity: QUANTITY,
        },
      })
      bundlePromoId = bundlePromo.id

      // The coupon the shopper types in. No ext config at all, which is what a
      // plain coupon looks like — auto_apply reads as false.
      couponCode = `COUPON50_${Date.now()}`
      const couponPromo = await promotionModule.createPromotions({
        code: couponCode,
        type: "standard",
        status: "active",
        is_automatic: false,
        application_method: {
          type: "percentage",
          target_type: "order",
          value: COUPON_PERCENTAGE,
          currency_code: currencyCode,
          allocation: "across",
        },
      })
      couponPromoId = couponPromo.id

      const extService: PromotionExtModuleService =
        container.resolve(PROMOTION_EXT_MODULE)
      await extService.createPromotionExtConfigs({
        promotion_id: bundlePromoId,
        auto_apply: true,
        promotion_mode: "bundle",
        mode_config: { bundle_size: QUANTITY, remainder: "full_price" },
      })
    })

    describe("typed coupon on a line that already has a bundle promotion", () => {
      it("control: the same coupon discounts a line with no bundle promotion", async () => {
        // One unit is not enough for the bundle, so nothing drains the budget.
        const cartId = await newCartWithWine(1)
        await settleAutoApplyPromos(cartId)
        await applyCouponLikeTheRoute(cartId)

        const cart = await fetchCart(cartId)
        expect(sumAdjustments(cart, bundlePromoId)).toBe(0)
        expect(sumAdjustments(cart, couponPromoId)).toBeCloseTo(
          (UNIT_PRICE * COUPON_PERCENTAGE) / 100,
          2
        )
      })

      it("discounts the line even though the bundle promotion drained the budget", async () => {
        const cartId = await newCartWithWine(QUANTITY)
        await settleAutoApplyPromos(cartId)

        const beforeCoupon = await fetchCart(cartId)
        expect(sumAdjustments(beforeCoupon, bundlePromoId)).toBeCloseTo(
          BUNDLE_SAVING,
          2
        )

        await applyCouponLikeTheRoute(cartId)
        const cart = await fetchCart(cartId)

        // The bundle keeps its own saving.
        expect(sumAdjustments(cart, bundlePromoId)).toBeCloseTo(BUNDLE_SAVING, 2)

        // This is the bug: the coupon lands at ~0 today.
        expect(sumAdjustments(cart, couponPromoId)).toBeCloseTo(
          EXPECTED_COUPON,
          2
        )
      })

      it("keeps the coupon linked to the cart", async () => {
        const cartId = await newCartWithWine(QUANTITY)
        await settleAutoApplyPromos(cartId)
        await applyCouponLikeTheRoute(cartId)

        const cart = await fetchCart(cartId)
        const codes = (cart.promotions ?? []).map((p: any) => p.code)
        expect(codes).toContain(couponCode)
      })
    })
  },
})
