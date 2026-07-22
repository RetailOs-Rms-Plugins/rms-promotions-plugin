import { recalcStandardAdjustments } from "../recalc-standard-adjustments"

function createMockContainer(overrides: {
  cartItems?: any[]
  promotions?: any[]
} = {}) {
  const { cartItems = [], promotions = [] } = overrides

  const upsertLineItemAdjustmentsCalls: any[][] = []

  const cartModule = {
    retrieveCart: jest.fn().mockResolvedValue({ items: cartItems }),
    upsertLineItemAdjustments: jest.fn().mockImplementation((updates) => {
      upsertLineItemAdjustmentsCalls.push(updates)
      return Promise.resolve()
    }),
  }

  const query = {
    graph: jest.fn().mockImplementation(({ entity }: { entity: string }) => {
      if (entity === "promotion") return Promise.resolve({ data: promotions })
      return Promise.resolve({ data: [] })
    }),
  }

  const container = {
    resolve: jest.fn().mockImplementation((key: string) => {
      if (key === "query") return query
      if (key === "cart") return cartModule
      return undefined
    }),
  }

  return { container, cartModule, query, upsertLineItemAdjustmentsCalls }
}

describe("recalcStandardAdjustments", () => {
  it("recalculates percentage adjustment using repriced unit_price", async () => {
    const { container, upsertLineItemAdjustmentsCalls } = createMockContainer({
      cartItems: [
        {
          id: "item_1",
          unit_price: 800, // repriced from 1500 to 800
          quantity: 3,
          adjustments: [
            {
              id: "adj_1",
              item_id: "item_1",
              code: "OFF10",
              amount: 450, // wrong: 10% of 1500 × 3
              promotion_id: "promo_1",
              provider_id: null,
            },
          ],
        },
      ],
      promotions: [
        {
          id: "promo_1",
          application_method: { type: "percentage", value: 10 },
        },
      ],
    })

    await recalcStandardAdjustments("cart_1", container)

    expect(upsertLineItemAdjustmentsCalls).toHaveLength(1)
    const updates = upsertLineItemAdjustmentsCalls[0]
    expect(updates).toHaveLength(1)
    expect(updates[0].id).toBe("adj_1")
    expect(updates[0].item_id).toBe("item_1")
    expect(updates[0].amount).toBe(240) // correct: 10% of 800 × 3
  })

  it("does not touch fixed-amount adjustments", async () => {
    const { container, upsertLineItemAdjustmentsCalls } = createMockContainer({
      cartItems: [
        {
          id: "item_1",
          unit_price: 800,
          quantity: 3,
          adjustments: [
            {
              id: "adj_1",
              item_id: "item_1",
              code: "FLAT5",
              amount: 500,
              promotion_id: "promo_1",
              provider_id: null,
            },
          ],
        },
      ],
      promotions: [
        {
          id: "promo_1",
          application_method: { type: "fixed", value: 500 },
        },
      ],
    })

    await recalcStandardAdjustments("cart_1", container)

    expect(upsertLineItemAdjustmentsCalls).toHaveLength(0)
  })

  it("skips items with no adjustments", async () => {
    const { container, upsertLineItemAdjustmentsCalls } = createMockContainer({
      cartItems: [
        {
          id: "item_1",
          unit_price: 800,
          quantity: 1,
          adjustments: [],
        },
      ],
      promotions: [],
    })

    await recalcStandardAdjustments("cart_1", container)

    expect(upsertLineItemAdjustmentsCalls).toHaveLength(0)
  })

  it("only recalculates adjustments that actually changed", async () => {
    const { container, upsertLineItemAdjustmentsCalls } = createMockContainer({
      cartItems: [
        {
          id: "item_1",
          unit_price: 1000, // price wasn't repriced
          quantity: 2,
          adjustments: [
            {
              id: "adj_1",
              item_id: "item_1",
              code: "OFF10",
              amount: 200, // already correct: 10% of 1000 × 2
              promotion_id: "promo_1",
              provider_id: null,
            },
          ],
        },
      ],
      promotions: [
        {
          id: "promo_1",
          application_method: { type: "percentage", value: 10 },
        },
      ],
    })

    await recalcStandardAdjustments("cart_1", container)

    expect(upsertLineItemAdjustmentsCalls).toHaveLength(0)
  })

  it("handles multiple items with mixed repriced and non-repriced prices", async () => {
    const { container, upsertLineItemAdjustmentsCalls } = createMockContainer({
      cartItems: [
        {
          id: "item_1",
          unit_price: 800, // repriced from 1500
          quantity: 3,
          adjustments: [
            {
              id: "adj_1",
              item_id: "item_1",
              code: "OFF10",
              amount: 450, // wrong: 10% of 1500 × 3
              promotion_id: "promo_1",
              provider_id: null,
            },
          ],
        },
        {
          id: "item_2",
          unit_price: 2000, // not repriced
          quantity: 1,
          adjustments: [
            {
              id: "adj_2",
              item_id: "item_2",
              code: "OFF10",
              amount: 200, // correct: 10% of 2000 × 1
              promotion_id: "promo_1",
              provider_id: null,
            },
          ],
        },
      ],
      promotions: [
        {
          id: "promo_1",
          application_method: { type: "percentage", value: 10 },
        },
      ],
    })

    await recalcStandardAdjustments("cart_1", container)

    expect(upsertLineItemAdjustmentsCalls).toHaveLength(1)
    const updates = upsertLineItemAdjustmentsCalls[0]
    // only item_1 should be updated, item_2 is already correct
    expect(updates).toHaveLength(1)
    expect(updates[0].id).toBe("adj_1")
    expect(updates[0].amount).toBe(240)
  })

  it("caps fixed-amount adjustment when it exceeds repriced item subtotal", async () => {
    const { container, upsertLineItemAdjustmentsCalls } = createMockContainer({
      cartItems: [
        {
          id: "item_1",
          unit_price: 400, // repriced from 1500 to 400
          quantity: 1,
          adjustments: [
            {
              id: "adj_1",
              item_id: "item_1",
              code: "FLAT5",
              amount: 500, // €5 off, but item is now only €4
              promotion_id: "promo_1",
              provider_id: null,
            },
          ],
        },
      ],
      promotions: [
        {
          id: "promo_1",
          application_method: { type: "fixed", value: 500 },
        },
      ],
    })

    await recalcStandardAdjustments("cart_1", container)

    expect(upsertLineItemAdjustmentsCalls).toHaveLength(1)
    const updates = upsertLineItemAdjustmentsCalls[0]
    expect(updates).toHaveLength(1)
    expect(updates[0].id).toBe("adj_1")
    expect(updates[0].amount).toBe(400) // capped at item subtotal
  })

  it("does not touch fixed-amount adjustment when it fits within repriced price", async () => {
    const { container, upsertLineItemAdjustmentsCalls } = createMockContainer({
      cartItems: [
        {
          id: "item_1",
          unit_price: 800,
          quantity: 1,
          adjustments: [
            {
              id: "adj_1",
              item_id: "item_1",
              code: "FLAT5",
              amount: 500,
              promotion_id: "promo_1",
              provider_id: null,
            },
          ],
        },
      ],
      promotions: [
        {
          id: "promo_1",
          application_method: { type: "fixed", value: 500 },
        },
      ],
    })

    await recalcStandardAdjustments("cart_1", container)

    expect(upsertLineItemAdjustmentsCalls).toHaveLength(0)
  })
})
