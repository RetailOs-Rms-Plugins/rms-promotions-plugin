/**
 * Integration test: adding custom items to orders via order-edit.
 *
 * Verifies the POST /admin/order-edits/:id/custom-items route —
 * a thin wrapper around orderEditAddNewItemWorkflow with a relaxed
 * validator that allows items without variant_id.
 *
 * Requires a full Medusa application with the plugin installed.
 * Run: TEST_TYPE=integration:http jest integration-tests/http/order-edit-custom-items.spec.ts
 */

import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  Modules,
  ContainerRegistrationKeys,
} from "@medusajs/framework/utils"

jest.setTimeout(300 * 1000)

medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api }) => {
    let orderId: string
    let regionId: string
    let currencyCode: string

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
    })

    const createUnpaidOrder = async () => {
      const container = getContainer()
      const orderModule = container.resolve(Modules.ORDER)

      const order = await orderModule.createOrders({
        region_id: regionId,
        currency_code: currencyCode,
        items: [
          {
            title: "Existing Product",
            quantity: 2,
            unit_price: 5000,
          },
        ],
      })

      return order
    }

    describe("POST /admin/order-edits/:id/custom-items", () => {
      it("adds a custom item with title, unit_price, and quantity", async () => {
        const order = await createUnpaidOrder()

        // Begin edit session
        const {
          data: { order_change },
        } = await api.post("/admin/order-edits", {
          order_id: order.id,
        })

        // Add custom item
        const { data, status } = await api.post(
          `/admin/order-edits/${order.id}/custom-items`,
          {
            title: "10% off",
            unit_price: -1000,
            quantity: 1,
          }
        )

        expect(status).toBe(200)
        expect(data.order_preview).toBeDefined()

        // Confirm the edit
        await api.post(`/admin/order-edits/${order.id}/request`)
        await api.post(`/admin/order-edits/${order.id}/confirm`)

        // Verify custom item on the order
        const container = getContainer()
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        const { data: orders } = await query.graph({
          entity: "order",
          fields: [
            "items.title",
            "items.unit_price",
            "items.quantity",
            "items.is_custom_price",
            "items.variant_id",
            "items.product_id",
          ],
          filters: { id: order.id },
        })

        const updatedOrder = orders[0]
        const customItem = updatedOrder.items.find(
          (i: any) => i.title === "10% off"
        )

        expect(customItem).toBeDefined()
        expect(customItem.unit_price).toBe(-1000)
        expect(customItem.quantity).toBe(1)
        expect(customItem.is_custom_price).toBe(true)
        expect(customItem.variant_id).toBeNull()
        expect(customItem.product_id).toBeNull()
      })

      it("accepts negative unit_price for discount items", async () => {
        const order = await createUnpaidOrder()

        await api.post("/admin/order-edits", { order_id: order.id })

        const { status } = await api.post(
          `/admin/order-edits/${order.id}/custom-items`,
          {
            title: "Loyalty discount",
            unit_price: -2500,
            quantity: 1,
          }
        )

        expect(status).toBe(200)

        // Cleanup
        await api.delete(`/admin/order-edits/${order.id}`)
      })

      it("accepts quantity greater than 1", async () => {
        const order = await createUnpaidOrder()

        await api.post("/admin/order-edits", { order_id: order.id })

        const { data, status } = await api.post(
          `/admin/order-edits/${order.id}/custom-items`,
          {
            title: "Gift wrapping",
            unit_price: 500,
            quantity: 3,
          }
        )

        expect(status).toBe(200)

        // Confirm and verify
        await api.post(`/admin/order-edits/${order.id}/request`)
        await api.post(`/admin/order-edits/${order.id}/confirm`)

        const container = getContainer()
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        const { data: orders } = await query.graph({
          entity: "order",
          fields: ["items.title", "items.quantity"],
          filters: { id: order.id },
        })

        const giftItem = orders[0].items.find(
          (i: any) => i.title === "Gift wrapping"
        )
        expect(giftItem).toBeDefined()
        expect(giftItem.quantity).toBe(3)
      })

      it("returns error when no active edit session exists", async () => {
        const order = await createUnpaidOrder()

        try {
          await api.post(
            `/admin/order-edits/${order.id}/custom-items`,
            {
              title: "Should fail",
              unit_price: -500,
              quantity: 1,
            }
          )
          fail("Expected request to fail")
        } catch (error: any) {
          expect(error.response.status).toBeGreaterThanOrEqual(400)
        }
      })

      it("returns 400 when order is paid", async () => {
        const container = getContainer()
        const orderModule = container.resolve(Modules.ORDER)

        const order = await orderModule.createOrders({
          region_id: regionId,
          currency_code: currencyCode,
          items: [
            { title: "Paid item", quantity: 1, unit_price: 3000 },
          ],
        })

        // Update payment status to simulate paid order
        await orderModule.updateOrders(order.id, {
          payment_status: "captured",
        } as any)

        try {
          await api.post(
            `/admin/order-edits/${order.id}/custom-items`,
            {
              title: "Should fail",
              unit_price: -500,
              quantity: 1,
            }
          )
          fail("Expected request to fail")
        } catch (error: any) {
          expect(error.response.status).toBe(400)
        }
      })

      it("returns 400 when order is fulfilled", async () => {
        const container = getContainer()
        const orderModule = container.resolve(Modules.ORDER)

        const order = await orderModule.createOrders({
          region_id: regionId,
          currency_code: currencyCode,
          items: [
            { title: "Fulfilled item", quantity: 1, unit_price: 3000 },
          ],
        })

        // Update fulfillment status
        await orderModule.updateOrders(order.id, {
          fulfillment_status: "fulfilled",
        } as any)

        try {
          await api.post(
            `/admin/order-edits/${order.id}/custom-items`,
            {
              title: "Should fail",
              unit_price: -500,
              quantity: 1,
            }
          )
          fail("Expected request to fail")
        } catch (error: any) {
          expect(error.response.status).toBe(400)
        }
      })

      it("preserves existing adjustments on other items", async () => {
        const container = getContainer()
        const orderModule = container.resolve(Modules.ORDER)

        const order = await orderModule.createOrders({
          region_id: regionId,
          currency_code: currencyCode,
          items: [
            { title: "Product A", quantity: 1, unit_price: 5000 },
          ],
        })

        // Add an adjustment to the existing item
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        const { data: orders } = await query.graph({
          entity: "order",
          fields: ["items.id"],
          filters: { id: order.id },
        })
        const existingItemId = orders[0].items[0].id

        await orderModule.addOrderLineItemAdjustments(order.id, [
          {
            item_id: existingItemId,
            amount: 500,
            code: "PROMO_TEST",
            description: "Test promo",
          },
        ] as any)

        // Begin edit and add custom item
        await api.post("/admin/order-edits", { order_id: order.id })
        await api.post(
          `/admin/order-edits/${order.id}/custom-items`,
          {
            title: "Manual discount",
            unit_price: -1000,
            quantity: 1,
          }
        )

        // Confirm edit
        await api.post(`/admin/order-edits/${order.id}/request`)
        await api.post(`/admin/order-edits/${order.id}/confirm`)

        // Verify original adjustment still exists
        const { data: updatedOrders } = await query.graph({
          entity: "order",
          fields: [
            "items.id",
            "items.title",
            "items.adjustments.code",
            "items.adjustments.amount",
          ],
          filters: { id: order.id },
        })

        const productA = updatedOrders[0].items.find(
          (i: any) => i.title === "Product A"
        )
        expect(productA).toBeDefined()

        const promoAdj = productA.adjustments?.find(
          (a: any) => a.code === "PROMO_TEST"
        )
        expect(promoAdj).toBeDefined()
        expect(promoAdj.amount).toBe(500)
      })
    })
  },
})
