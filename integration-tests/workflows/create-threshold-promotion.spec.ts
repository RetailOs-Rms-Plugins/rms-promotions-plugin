/**
 * These tests require a full Medusa application (all commerce modules + migrations).
 * Run them from the medusa-backend project after installing the plugin.
 *
 * To run locally:
 *   1. Add this plugin to medusa-backend
 *   2. Run: TEST_TYPE=integration:http jest integration-tests/workflows/create-threshold-promotion.spec.ts
 */

import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { createThresholdPromotionWorkflow } from "../../src/workflows/create-threshold-promotion"
import { THRESHOLD_PROMOTION_MODULE } from "../../src/modules/threshold-promotion"
import ThresholdPromotionModuleService from "../../src/modules/threshold-promotion/service"

medusaIntegrationTestRunner({
  testSuite: ({ getContainer }) => {
    describe("createThresholdPromotionWorkflow", () => {
      it("creates a promotion and a linked threshold rule", async () => {
        const container = getContainer()

        const { result } = await createThresholdPromotionWorkflow(container).run({
          input: {
            code: "OVER100",
            minCartSubtotal: 100,
            discountType: "fixed",
            discountValue: 10,
            currencyCode: "ILS",
            isAutomatic: true,
          },
        })

        expect(result.promotion.id).toBeDefined()
        expect(result.promotion.code).toEqual("OVER100")
        expect(result.rule.id).toBeDefined()
        expect(result.rule.min_cart_subtotal).toEqual(100)

        const service: ThresholdPromotionModuleService = container.resolve(THRESHOLD_PROMOTION_MODULE)
        const persisted = await service.retrieveThresholdRule(result.rule.id)
        expect(persisted.min_cart_subtotal).toEqual(100)
      })

      it("rolls back the promotion when threshold rule creation fails", async () => {
        const container = getContainer()
        const promotionService = container.resolve("promotion")

        const promotionsBefore = await promotionService.listPromotions({ code: ["ROLLBACK_TEST"] })

        await expect(
          createThresholdPromotionWorkflow(container).run({
            input: {
              code: "ROLLBACK_TEST",
              minCartSubtotal: -1,
              discountType: "fixed",
              discountValue: 10,
              currencyCode: "ILS",
              isAutomatic: false,
            },
          })
        ).rejects.toThrow()

        const promotionsAfter = await promotionService.listPromotions({ code: ["ROLLBACK_TEST"] })
        expect(promotionsAfter.length).toEqual(promotionsBefore.length)
      })
    })
  },
})

jest.setTimeout(300 * 1000)
