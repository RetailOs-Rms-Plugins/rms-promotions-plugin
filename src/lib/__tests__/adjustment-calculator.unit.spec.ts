import { computeBundle, computeBuyGetRepeat, type EligibleItem, type BuyGetRepeatModeConfig } from "../adjustment-calculator"

const makeItems = (items: { id: string; unit_price: number; quantity: number }[]): EligibleItem[] =>
  items.map((i) => ({ ...i }))

// ─── computeBundle ──────────────────────────────────────────────────────────

describe("computeBundle", () => {
  const bundleConfig = { bundle_size: 3, bundle_price: 5000, remainder: "full_price" as const }

  it("computes correct savings for exact multiples", () => {
    const items = makeItems([
      { id: "item_a", unit_price: 2000, quantity: 3 },
      { id: "item_b", unit_price: 2000, quantity: 3 },
    ])
    // 6 items at 2000 each = 12000 original
    // 2 bundles at 5000 = 10000
    // savings = 2000
    const result = computeBundle("promo_1", items, bundleConfig)

    expect(result.promotion_id).toBe("promo_1")
    const totalAdjustment = result.adjustments.reduce((sum, a) => sum + a.amount, 0)
    expect(totalAdjustment).toBe(2000)
  })

  it("handles remainder items at full price", () => {
    const items = makeItems([
      { id: "item_a", unit_price: 2000, quantity: 7 },
    ])
    // 7 items: 2 bundles (6 items) + 1 remainder
    // bundled original: 6 * 2000 = 12000, bundle cost: 2 * 5000 = 10000, savings: 2000
    // remainder: 1 item at full price (no discount)
    const result = computeBundle("promo_1", items, bundleConfig)
    const totalAdjustment = result.adjustments.reduce((sum, a) => sum + a.amount, 0)
    expect(totalAdjustment).toBe(2000)
  })

  it("returns no adjustments when quantity is less than bundle_size", () => {
    const items = makeItems([
      { id: "item_a", unit_price: 2000, quantity: 2 },
    ])
    const result = computeBundle("promo_1", items, bundleConfig)
    expect(result.adjustments).toHaveLength(0)
  })

  it("computes correctly for exactly one bundle", () => {
    const items = makeItems([
      { id: "item_a", unit_price: 2000, quantity: 3 },
    ])
    // 3 items at 2000 = 6000, 1 bundle at 5000, savings: 1000
    const result = computeBundle("promo_1", items, bundleConfig)
    const totalAdjustment = result.adjustments.reduce((sum, a) => sum + a.amount, 0)
    expect(totalAdjustment).toBe(1000)
  })

  it("returns no adjustments when bundle price exceeds original total", () => {
    const items = makeItems([
      { id: "item_a", unit_price: 1000, quantity: 3 },
    ])
    // 3 items at 1000 = 3000, bundle at 5000 — no savings
    const result = computeBundle("promo_1", items, bundleConfig)
    expect(result.adjustments).toHaveLength(0)
  })

  it("handles multiple items with different prices", () => {
    const items = makeItems([
      { id: "item_a", unit_price: 3000, quantity: 2 },
      { id: "item_b", unit_price: 1000, quantity: 1 },
    ])
    // 3 items: original = 3000 + 3000 + 1000 = 7000, 1 bundle at 5000, savings: 2000
    const result = computeBundle("promo_1", items, bundleConfig)
    const totalAdjustment = result.adjustments.reduce((sum, a) => sum + a.amount, 0)
    expect(totalAdjustment).toBe(2000)
  })

  it("returns empty adjustments for empty items", () => {
    const result = computeBundle("promo_1", [], bundleConfig)
    expect(result.adjustments).toHaveLength(0)
  })
})

// ─── computeBuyGetRepeat ────────────────────────────────────────────────────

describe("computeBuyGetRepeat", () => {
  const freeConfig: BuyGetRepeatModeConfig = {
    buy_quantity: 2,
    get_quantity: 1,
    discount_type: "percentage",
    discount_value: 100,
    discount_target: "cheapest",
    remainder: "full_price",
  }

  it("gives correct number of free items for exact groups", () => {
    // 9 items, buy 2 get 1 free → 3 groups, 3 items free
    const items = makeItems([
      { id: "item_a", unit_price: 2000, quantity: 9 },
    ])
    const result = computeBuyGetRepeat("promo_1", items, freeConfig)
    const totalAdjustment = result.adjustments.reduce((sum, a) => sum + a.amount, 0)
    // 3 free items at 2000 each = 6000
    expect(totalAdjustment).toBe(6000)
  })

  it("handles remainder items at full price", () => {
    // 7 items, buy 2 get 1 → 2 groups (6 items) + 1 remainder
    const items = makeItems([
      { id: "item_a", unit_price: 2000, quantity: 7 },
    ])
    const result = computeBuyGetRepeat("promo_1", items, freeConfig)
    const totalAdjustment = result.adjustments.reduce((sum, a) => sum + a.amount, 0)
    // 2 free items at 2000 = 4000
    expect(totalAdjustment).toBe(4000)
  })

  it("returns no adjustments when quantity is less than group size", () => {
    const items = makeItems([
      { id: "item_a", unit_price: 2000, quantity: 2 },
    ])
    const result = computeBuyGetRepeat("promo_1", items, freeConfig)
    expect(result.adjustments).toHaveLength(0)
  })

  it("discounts cheapest item in each group", () => {
    // 3 items with different prices: 1000, 2000, 3000
    // group of 3: cheapest (1000) gets the discount
    const items = makeItems([
      { id: "item_cheap", unit_price: 1000, quantity: 1 },
      { id: "item_mid", unit_price: 2000, quantity: 1 },
      { id: "item_expensive", unit_price: 3000, quantity: 1 },
    ])
    const result = computeBuyGetRepeat("promo_1", items, freeConfig)
    expect(result.adjustments).toHaveLength(1)
    expect(result.adjustments[0].item_id).toBe("item_cheap")
    expect(result.adjustments[0].amount).toBe(1000)
  })

  it("applies 50% percentage discount correctly", () => {
    const halfOffConfig: BuyGetRepeatModeConfig = {
      ...freeConfig,
      discount_value: 50,
    }
    const items = makeItems([
      { id: "item_a", unit_price: 2000, quantity: 3 },
    ])
    const result = computeBuyGetRepeat("promo_1", items, halfOffConfig)
    const totalAdjustment = result.adjustments.reduce((sum, a) => sum + a.amount, 0)
    // 1 discounted item at 50% of 2000 = 1000
    expect(totalAdjustment).toBe(1000)
  })

  it("applies fixed discount correctly", () => {
    const fixedConfig: BuyGetRepeatModeConfig = {
      ...freeConfig,
      discount_type: "fixed",
      discount_value: 500,
    }
    const items = makeItems([
      { id: "item_a", unit_price: 2000, quantity: 3 },
    ])
    const result = computeBuyGetRepeat("promo_1", items, fixedConfig)
    const totalAdjustment = result.adjustments.reduce((sum, a) => sum + a.amount, 0)
    // 1 discounted item, fixed 500 off
    expect(totalAdjustment).toBe(500)
  })

  it("caps fixed discount at unit_price", () => {
    const fixedConfig: BuyGetRepeatModeConfig = {
      ...freeConfig,
      discount_type: "fixed",
      discount_value: 9999,
    }
    const items = makeItems([
      { id: "item_a", unit_price: 2000, quantity: 3 },
    ])
    const result = computeBuyGetRepeat("promo_1", items, fixedConfig)
    const totalAdjustment = result.adjustments.reduce((sum, a) => sum + a.amount, 0)
    // fixed 9999 but capped at unit_price 2000
    expect(totalAdjustment).toBe(2000)
  })

  it("works with all same price items", () => {
    const items = makeItems([
      { id: "item_a", unit_price: 1500, quantity: 6 },
    ])
    const result = computeBuyGetRepeat("promo_1", items, freeConfig)
    const totalAdjustment = result.adjustments.reduce((sum, a) => sum + a.amount, 0)
    // 2 groups, 2 free items at 1500 = 3000
    expect(totalAdjustment).toBe(3000)
  })

  it("returns empty adjustments for empty items", () => {
    const result = computeBuyGetRepeat("promo_1", [], freeConfig)
    expect(result.adjustments).toHaveLength(0)
  })

  it("groups promotion_id correctly", () => {
    const items = makeItems([
      { id: "item_a", unit_price: 2000, quantity: 3 },
    ])
    const result = computeBuyGetRepeat("promo_xyz", items, freeConfig)
    expect(result.promotion_id).toBe("promo_xyz")
  })
})
