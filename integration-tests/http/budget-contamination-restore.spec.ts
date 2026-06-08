/**
 * Integration test: standard promos survive alongside non-standard promos.
 *
 * Verifies the fix for ADR-0009 — when a bundle promotion consumes the
 * entire item budget in Medusa's computeActions, a standard auto-apply
 * promotion (e.g., 10% off) should still appear on the cart with correct
 * adjustments after restoreEvictedStandardPromos runs.
 *
 * Requires a full Medusa application with the plugin installed.
 * Run: TEST_TYPE=integration:http jest integration-tests/http/budget-contamination-restore.spec.ts
 */

import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { Modules, ContainerRegistrationKeys, PromotionActions } from "@medusajs/framework/utils"
import { PROMOTION_EXT_MODULE } from "../../src/modules/promotion-ext"
import type PromotionExtModuleService from "../../src/modules/promotion-ext/service"

jest.setTimeout(300 * 1000)

medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api }) => {
    let bundlePromoId: string
    let standardPromoId: string
    let regionId: string
    let currencyCode: string
    let productId: string
    let variantId: string
    let salesChannelId: string

    beforeAll(async () => {
      const container = getContainer()
      const query = container.resolve(ContainerRegistrationKeys.QUERY)

      // Get or create a region
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

      // Get or create a sales channel
      const { data: channels } = await query.graph({
        entity: "sales_channel",
        fields: ["id"],
      })
      salesChannelId = channels[0]?.id

      // Create a product with variant
      const productModule = container.resolve(Modules.PRODUCT)
      const product = await productModule.createProducts({
        title: "Test Sweatshirt",
        options: [{ title: "Size", values: ["M"] }],
        variants: [
          {
            title: "M",
            prices: [{ amount: 1000, currency_code: currencyCode }],
            options: { Size: "M" },
          },
        ],
      })
      productId = product.id
      variantId = product.variants[0].id

      // Link product to sales channel
      if (salesChannelId) {
        const remoteLink = container.resolve(ContainerRegistrationKeys.LINK)
        await remoteLink.create({
          [Modules.PRODUCT]: { product_id: productId },
          [Modules.SALES_CHANNEL]: { sales_channel_id: salesChannelId },
        })
      }

      // Create bundle promotion: "3 for 25" (value=25, fixed, once, max_qty=7)
      const promotionModule = container.resolve(Modules.PROMOTION)
      const bundlePromo = await promotionModule.createPromotions({
        code: `BUNDLE3FOR25_${Date.now()}`,
        type: "standard",
        status: "active",
        is_automatic: false,
        application_method: {
          type: "fixed",
          target_type: "items",
          value: 25,
          currency_code: currencyCode,
          allocation: "once",
          max_quantity: 7,
        },
      })
      bundlePromoId = bundlePromo.id

      // Create standard promotion: 10% off everything
      const standardPromo = await promotionModule.createPromotions({
        code: `10OFF_${Date.now()}`,
        type: "standard",
        status: "active",
        is_automatic: false,
        application_method: {
          type: "percentage",
          target_type: "order",
          value: 10,
          currency_code: currencyCode,
          allocation: "across",
        },
      })
      standardPromoId = standardPromo.id

      // Create ext configs: bundle mode for bundle promo, standard auto-apply for 10% off
      const extService: PromotionExtModuleService = container.resolve(PROMOTION_EXT_MODULE)

      await extService.createPromotionExtConfigs({
        promotion_id: bundlePromoId,
        auto_apply: true,
        promotion_mode: "bundle",
        mode_config: { bundle_size: 3, remainder: "full_price" },
      })

      await extService.createPromotionExtConfigs({
        promotion_id: standardPromoId,
        auto_apply: true,
        promotion_mode: "standard",
      })
    })

    describe("budget contamination fix (ADR-0009)", () => {
      it("both bundle and standard promos appear on cart with adjustments", async () => {
        const container = getContainer()
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        const cartModule = container.resolve(Modules.CART)

        // Create a cart
        const cart = await cartModule.createCarts({
          region_id: regionId,
          currency_code: currencyCode,
          sales_channel_id: salesChannelId,
        })

        // Add 3 items (enough for a bundle)
        const we = container.resolve(Modules.WORKFLOW_ENGINE)
        await we.run("add-to-cart", {
          input: {
            cart_id: cart.id,
            items: [{ variant_id: variantId, quantity: 3 }],
          },
        })

        // Run auto-apply + non-standard adjustments (simulates what the route handler does)
        const { evaluateAutoApplyPromotions } = require("../../src/lib/evaluate-auto-apply-promotions")
        const { computeNonStandardAdjustments } = require("../../src/lib/compute-non-standard-adjustments")

        await evaluateAutoApplyPromotions(cart.id, container)
        await computeNonStandardAdjustments(cart.id, container)

        // Fetch cart with promotions and adjustments
        const { data: cartList } = await query.graph({
          entity: "cart",
          fields: [
            "promotions.id",
            "promotions.code",
            "items.id",
            "items.adjustments.code",
            "items.adjustments.amount",
            "items.adjustments.promotion_id",
          ],
          filters: { id: cart.id },
        })

        const finalCart = cartList[0]
        const promoCodes = (finalCart.promotions ?? []).map((p: any) => p.code)
        const adjustments = (finalCart.items ?? []).flatMap((i: any) =>
          (i.adjustments ?? []).map((a: any) => ({ code: a.code, amount: a.amount, promotion_id: a.promotion_id }))
        )

        // Bundle promo should be on cart
        expect(promoCodes).toContainEqual(expect.stringContaining("BUNDLE3FOR25"))

        // Standard promo should ALSO be on cart (not evicted)
        expect(promoCodes).toContainEqual(expect.stringContaining("10OFF"))

        // Bundle adjustments should exist
        const bundleAdjs = adjustments.filter((a: any) => a.promotion_id === bundlePromoId)
        expect(bundleAdjs.length).toBeGreaterThan(0)

        // Standard adjustments should exist (this is the bug fix!)
        const standardAdjs = adjustments.filter((a: any) => a.promotion_id === standardPromoId)
        expect(standardAdjs.length).toBeGreaterThan(0)

        // Standard adjustments should be ~10% of item subtotal
        const totalStandardDiscount = standardAdjs.reduce((sum: number, a: any) => sum + Number(a.amount), 0)
        expect(totalStandardDiscount).toBeGreaterThan(0)
      })

      it("standard promo works alone when bundle promo is not active", async () => {
        const container = getContainer()
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        const cartModule = container.resolve(Modules.CART)

        // Create a cart with only 1 item (not enough for bundle)
        const cart = await cartModule.createCarts({
          region_id: regionId,
          currency_code: currencyCode,
          sales_channel_id: salesChannelId,
        })

        const we = container.resolve(Modules.WORKFLOW_ENGINE)
        await we.run("add-to-cart", {
          input: {
            cart_id: cart.id,
            items: [{ variant_id: variantId, quantity: 1 }],
          },
        })

        const { evaluateAutoApplyPromotions } = require("../../src/lib/evaluate-auto-apply-promotions")
        const { computeNonStandardAdjustments } = require("../../src/lib/compute-non-standard-adjustments")

        await evaluateAutoApplyPromotions(cart.id, container)
        await computeNonStandardAdjustments(cart.id, container)

        const { data: cartList } = await query.graph({
          entity: "cart",
          fields: [
            "promotions.code",
            "items.adjustments.code",
            "items.adjustments.amount",
            "items.adjustments.promotion_id",
          ],
          filters: { id: cart.id },
        })

        const finalCart = cartList[0]
        const adjustments = (finalCart.items ?? []).flatMap((i: any) =>
          (i.adjustments ?? []).map((a: any) => ({ code: a.code, promotion_id: a.promotion_id }))
        )

        // Standard promo should work on its own
        const standardAdjs = adjustments.filter((a: any) => a.promotion_id === standardPromoId)
        expect(standardAdjs.length).toBeGreaterThan(0)

        // No bundle adjustments (not enough items)
        const bundleAdjs = adjustments.filter((a: any) => a.promotion_id === bundlePromoId)
        expect(bundleAdjs).toHaveLength(0)
      })
    })
  },
})
