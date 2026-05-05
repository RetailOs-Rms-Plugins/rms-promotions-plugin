import { moduleIntegrationTestRunner } from "@medusajs/test-utils"
import { THRESHOLD_PROMOTION_MODULE } from ".."
import ThresholdPromotionModuleService from "../service"
import ThresholdRule from "../models/threshold-rule"

moduleIntegrationTestRunner<ThresholdPromotionModuleService>({
  moduleName: THRESHOLD_PROMOTION_MODULE,
  moduleModels: [ThresholdRule],
  resolve: "./src/modules/threshold-promotion",
  testSuite: ({ service }) => {
    describe("ThresholdPromotionModuleService", () => {
      it("creates a threshold rule and retrieves it by id", async () => {
        const rule = await service.createThresholdRules({
          min_cart_subtotal: 100,
        })

        expect(rule.id).toBeDefined()
        expect(rule.min_cart_subtotal).toEqual(100)

        const fetched = await service.retrieveThresholdRule(rule.id)
        expect(fetched.min_cart_subtotal).toEqual(100)
      })

      it("updates a threshold rule's min_cart_subtotal", async () => {
        const rule = await service.createThresholdRules({ min_cart_subtotal: 100 })

        const updated = await service.updateThresholdRules({
          id: rule.id,
          min_cart_subtotal: 250,
        })

        expect(updated.min_cart_subtotal).toEqual(250)
      })

      it("deletes a threshold rule", async () => {
        const rule = await service.createThresholdRules({ min_cart_subtotal: 100 })

        await service.deleteThresholdRules(rule.id)

        await expect(service.retrieveThresholdRule(rule.id)).rejects.toThrow()
      })

      it("lists all threshold rules", async () => {
        await service.createThresholdRules({ min_cart_subtotal: 100 })
        await service.createThresholdRules({ min_cart_subtotal: 300 })

        const rules = await service.listThresholdRules()

        expect(rules.length).toBeGreaterThanOrEqual(2)
        const subtotals = rules.map((r) => r.min_cart_subtotal)
        expect(subtotals).toContain(100)
        expect(subtotals).toContain(300)
      })
    })
  },
})

jest.setTimeout(60 * 1000)
