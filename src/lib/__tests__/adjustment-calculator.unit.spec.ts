import { computeBundle, computeBuyGetRepeat, resolveExclusiveNonStandard, capAdjustmentsToSubtotal, type EligibleItem, type BuyGetRepeatModeConfig, type BundleModeConfig, type PromotionAdjustmentGroup } from "../adjustment-calculator"

const makeItems = (items: { id: string; unit_price: number; quantity: number }[]): EligibleItem[] =>
  items.map((i) => ({ ...i }))

// ─── computeBundle ──────────────────────────────────────────────────────────

describe("computeBundle", () => {
  const bundleConfig: BundleModeConfig = { bundle_size: 3, remainder: "full_price" }
  const bundleAM = { value: 5000 }

  it("computes correct savings for exact multiples", () => {
    const items = makeItems([
      { id: "item_a", unit_price: 2000, quantity: 3 },
      { id: "item_b", unit_price: 2000, quantity: 3 },
    ])
    // 6 items at 2000 each = 12000 original
    // 2 bundles at 5000 = 10000
    // savings = 2000
    const result = computeBundle("promo_1", items, bundleConfig, bundleAM)

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
    const result = computeBundle("promo_1", items, bundleConfig, bundleAM)
    const totalAdjustment = result.adjustments.reduce((sum, a) => sum + a.amount, 0)
    expect(totalAdjustment).toBe(2000)
  })

  it("returns no adjustments when quantity is less than bundle_size", () => {
    const items = makeItems([
      { id: "item_a", unit_price: 2000, quantity: 2 },
    ])
    const result = computeBundle("promo_1", items, bundleConfig, bundleAM)
    expect(result.adjustments).toHaveLength(0)
  })

  it("computes correctly for exactly one bundle", () => {
    const items = makeItems([
      { id: "item_a", unit_price: 2000, quantity: 3 },
    ])
    // 3 items at 2000 = 6000, 1 bundle at 5000, savings: 1000
    const result = computeBundle("promo_1", items, bundleConfig, bundleAM)
    const totalAdjustment = result.adjustments.reduce((sum, a) => sum + a.amount, 0)
    expect(totalAdjustment).toBe(1000)
  })

  it("returns no adjustments when bundle price exceeds original total", () => {
    const items = makeItems([
      { id: "item_a", unit_price: 1000, quantity: 3 },
    ])
    // 3 items at 1000 = 3000, bundle at 5000 — no savings
    const result = computeBundle("promo_1", items, bundleConfig, bundleAM)
    expect(result.adjustments).toHaveLength(0)
  })

  it("handles multiple items with different prices", () => {
    const items = makeItems([
      { id: "item_a", unit_price: 3000, quantity: 2 },
      { id: "item_b", unit_price: 1000, quantity: 1 },
    ])
    // 3 items: original = 3000 + 3000 + 1000 = 7000, 1 bundle at 5000, savings: 2000
    const result = computeBundle("promo_1", items, bundleConfig, bundleAM)
    const totalAdjustment = result.adjustments.reduce((sum, a) => sum + a.amount, 0)
    expect(totalAdjustment).toBe(2000)
  })

  it("returns empty adjustments for empty items", () => {
    const result = computeBundle("promo_1", [], bundleConfig, bundleAM)
    expect(result.adjustments).toHaveLength(0)
  })

  it("max_quantity caps participating items (exact multiple)", () => {
    const items = makeItems([
      { id: "item_a", unit_price: 2000, quantity: 9 },
    ])
    // 9 items, bundle_size=3, max_quantity=6 → floor(6/3)=2 bundles
    // 2 bundles: original 12000, cost 10000, savings 2000
    const result = computeBundle("promo_1", items, bundleConfig, { value: 5000, max_quantity: 6 })
    const totalAdjustment = result.adjustments.reduce((sum, a) => sum + a.amount, 0)
    expect(totalAdjustment).toBe(2000)
  })

  it("max_quantity caps participating items (partial bundle discarded)", () => {
    const items = makeItems([
      { id: "item_a", unit_price: 2000, quantity: 9 },
    ])
    // 9 items, bundle_size=3, max_quantity=7 → floor(7/3)=2 bundles (6 items)
    // 7th item doesn't complete a bundle
    const result = computeBundle("promo_1", items, bundleConfig, { value: 5000, max_quantity: 7 })
    const totalAdjustment = result.adjustments.reduce((sum, a) => sum + a.amount, 0)
    expect(totalAdjustment).toBe(2000)
  })

  it("max_quantity too small for even one bundle", () => {
    const items = makeItems([
      { id: "item_a", unit_price: 2000, quantity: 9 },
    ])
    // max_quantity=2, bundle_size=3 → floor(2/3)=0 bundles
    const result = computeBundle("promo_1", items, bundleConfig, { value: 5000, max_quantity: 2 })
    expect(result.adjustments).toHaveLength(0)
  })

  it("max_quantity null means unlimited", () => {
    const items = makeItems([
      { id: "item_a", unit_price: 2000, quantity: 9 },
    ])
    // 9 items → 3 bundles, no cap
    const result = computeBundle("promo_1", items, bundleConfig, { value: 5000, max_quantity: null })
    const totalAdjustment = result.adjustments.reduce((sum, a) => sum + a.amount, 0)
    // 3 bundles: original 18000, cost 15000, savings 3000
    expect(totalAdjustment).toBe(3000)
  })

  it("bundle_size=1 sets target price per individual item", () => {
    const singleConfig: BundleModeConfig = { bundle_size: 1, remainder: "full_price" }
    const items = makeItems([
      { id: "item_a", unit_price: 6000, quantity: 1 },
      { id: "item_b", unit_price: 7200, quantity: 1 },
      { id: "item_c", unit_price: 5500, quantity: 1 },
      { id: "item_d", unit_price: 13000, quantity: 1 },
    ])
    // target price 4990 per item
    // item_a: 6000 - 4990 = 1010
    // item_b: 7200 - 4990 = 2210
    // item_c: 5500 - 4990 = 510
    // item_d: 13000 - 4990 = 8010
    // total savings = 11740
    const result = computeBundle("promo_1", items, singleConfig, { value: 4990 })
    const totalAdjustment = result.adjustments.reduce((sum, a) => sum + a.amount, 0)
    expect(totalAdjustment).toBe(11740)
    expect(result.adjustments).toHaveLength(4)
    const byItem = new Map(result.adjustments.map((a) => [a.item_id, a.amount]))
    expect(byItem.get("item_a")).toBe(1010)
    expect(byItem.get("item_b")).toBe(2210)
    expect(byItem.get("item_c")).toBe(510)
    expect(byItem.get("item_d")).toBe(8010)
  })

  it("each bundle group distributes savings independently", () => {
    // bundle_size=2, two groups with different price mixes
    const items = makeItems([
      { id: "item_expensive", unit_price: 5000, quantity: 2 },
      { id: "item_cheap", unit_price: 1000, quantity: 2 },
    ])
    // expanded: [expensive, expensive, cheap, cheap]
    // group 1: expensive(5000) + expensive(5000) = 10000, bundle=3000, savings=7000
    //   each gets floor(7000 * 5000/10000) = 3500
    // group 2: cheap(1000) + cheap(1000) = 2000, bundle=3000, savings=-1000 → no savings
    // only group 1 should produce adjustments
    const result = computeBundle("promo_1", items, { bundle_size: 2, remainder: "full_price" }, { value: 3000 })
    const byItem = new Map(result.adjustments.map((a) => [a.item_id, a.amount]))
    expect(byItem.get("item_expensive")).toBe(7000)
    expect(byItem.has("item_cheap")).toBe(false)
  })

  it("bundle_size=1 skips items cheaper than target price", () => {
    const singleConfig: BundleModeConfig = { bundle_size: 1, remainder: "full_price" }
    const items = makeItems([
      { id: "item_cheap", unit_price: 1000, quantity: 1 },
    ])
    // target price 4990 > item price 1000 → no savings
    const result = computeBundle("promo_1", items, singleConfig, { value: 4990 })
    expect(result.adjustments).toHaveLength(0)
  })
})

// ─── computeBuyGetRepeat ────────────────────────────────────────────────────

describe("computeBuyGetRepeat", () => {
  const baseConfig: BuyGetRepeatModeConfig = {
    buy_quantity: 2,
    get_quantity: 1,
    discount_target: "cheapest",
    remainder: "full_price",
  }
  const freeAM = { type: "percentage" as const, value: 100 }

  it("gives correct number of free items for exact groups", () => {
    // 9 items, buy 2 get 1 free → 3 groups, 3 items free
    const items = makeItems([
      { id: "item_a", unit_price: 2000, quantity: 9 },
    ])
    const result = computeBuyGetRepeat("promo_1", items, baseConfig, freeAM)
    const totalAdjustment = result.adjustments.reduce((sum, a) => sum + a.amount, 0)
    // 3 free items at 2000 each = 6000
    expect(totalAdjustment).toBe(6000)
  })

  it("handles remainder items at full price", () => {
    // 7 items, buy 2 get 1 → 2 groups (6 items) + 1 remainder
    const items = makeItems([
      { id: "item_a", unit_price: 2000, quantity: 7 },
    ])
    const result = computeBuyGetRepeat("promo_1", items, baseConfig, freeAM)
    const totalAdjustment = result.adjustments.reduce((sum, a) => sum + a.amount, 0)
    // 2 free items at 2000 = 4000
    expect(totalAdjustment).toBe(4000)
  })

  it("returns no adjustments when quantity is less than group size", () => {
    const items = makeItems([
      { id: "item_a", unit_price: 2000, quantity: 2 },
    ])
    const result = computeBuyGetRepeat("promo_1", items, baseConfig, freeAM)
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
    const result = computeBuyGetRepeat("promo_1", items, baseConfig, freeAM)
    expect(result.adjustments).toHaveLength(1)
    expect(result.adjustments[0].item_id).toBe("item_cheap")
    expect(result.adjustments[0].amount).toBe(1000)
  })

  it("applies 50% percentage discount correctly", () => {
    const items = makeItems([
      { id: "item_a", unit_price: 2000, quantity: 3 },
    ])
    const result = computeBuyGetRepeat("promo_1", items, baseConfig, { type: "percentage", value: 50 })
    const totalAdjustment = result.adjustments.reduce((sum, a) => sum + a.amount, 0)
    // 1 discounted item at 50% of 2000 = 1000
    expect(totalAdjustment).toBe(1000)
  })

  it("applies fixed discount correctly", () => {
    const items = makeItems([
      { id: "item_a", unit_price: 2000, quantity: 3 },
    ])
    const result = computeBuyGetRepeat("promo_1", items, baseConfig, { type: "fixed", value: 500 })
    const totalAdjustment = result.adjustments.reduce((sum, a) => sum + a.amount, 0)
    // 1 discounted item, fixed 500 off
    expect(totalAdjustment).toBe(500)
  })

  it("caps fixed discount at unit_price", () => {
    const items = makeItems([
      { id: "item_a", unit_price: 2000, quantity: 3 },
    ])
    const result = computeBuyGetRepeat("promo_1", items, baseConfig, { type: "fixed", value: 9999 })
    const totalAdjustment = result.adjustments.reduce((sum, a) => sum + a.amount, 0)
    // fixed 9999 but capped at unit_price 2000
    expect(totalAdjustment).toBe(2000)
  })

  it("works with all same price items", () => {
    const items = makeItems([
      { id: "item_a", unit_price: 1500, quantity: 6 },
    ])
    const result = computeBuyGetRepeat("promo_1", items, baseConfig, freeAM)
    const totalAdjustment = result.adjustments.reduce((sum, a) => sum + a.amount, 0)
    // 2 groups, 2 free items at 1500 = 3000
    expect(totalAdjustment).toBe(3000)
  })

  it("returns empty adjustments for empty items", () => {
    const result = computeBuyGetRepeat("promo_1", [], baseConfig, freeAM)
    expect(result.adjustments).toHaveLength(0)
  })

  it("groups promotion_id correctly", () => {
    const items = makeItems([
      { id: "item_a", unit_price: 2000, quantity: 3 },
    ])
    const result = computeBuyGetRepeat("promo_xyz", items, baseConfig, freeAM)
    expect(result.promotion_id).toBe("promo_xyz")
  })

  it("max_quantity caps by buy items (exact multiple)", () => {
    const items = makeItems([
      { id: "item_a", unit_price: 2000, quantity: 9 },
    ])
    // buy_quantity=2, get_quantity=1, max_quantity=4 → floor(4/2)=2 cycles
    // 2 cycles, 2 free items at 2000 = 4000
    const result = computeBuyGetRepeat("promo_1", items, baseConfig, { type: "percentage", value: 100, max_quantity: 4 })
    const totalAdjustment = result.adjustments.reduce((sum, a) => sum + a.amount, 0)
    expect(totalAdjustment).toBe(4000)
  })

  it("max_quantity caps by buy items (partial cycle discarded)", () => {
    const items = makeItems([
      { id: "item_a", unit_price: 2000, quantity: 9 },
    ])
    // buy_quantity=2, get_quantity=1, max_quantity=3 → floor(3/2)=1 cycle
    const result = computeBuyGetRepeat("promo_1", items, baseConfig, { type: "percentage", value: 100, max_quantity: 3 })
    const totalAdjustment = result.adjustments.reduce((sum, a) => sum + a.amount, 0)
    expect(totalAdjustment).toBe(2000)
  })

  it("max_quantity too small for even one cycle", () => {
    const items = makeItems([
      { id: "item_a", unit_price: 2000, quantity: 9 },
    ])
    // buy_quantity=2, max_quantity=1 → floor(1/2)=0 cycles
    const result = computeBuyGetRepeat("promo_1", items, baseConfig, { type: "percentage", value: 100, max_quantity: 1 })
    expect(result.adjustments).toHaveLength(0)
  })

  it("max_quantity null means unlimited", () => {
    const items = makeItems([
      { id: "item_a", unit_price: 2000, quantity: 9 },
    ])
    const result = computeBuyGetRepeat("promo_1", items, baseConfig, { type: "percentage", value: 100, max_quantity: null })
    const totalAdjustment = result.adjustments.reduce((sum, a) => sum + a.amount, 0)
    // 3 groups, 3 free items at 2000 = 6000
    expect(totalAdjustment).toBe(6000)
  })
})

// ─── resolveExclusiveNonStandard ────────────────────────────────────────────

describe("resolveExclusiveNonStandard", () => {
  it("picks the higher-savings promo when two promos target the same items", () => {
    const groups: PromotionAdjustmentGroup[] = [
      {
        promotion_id: "bundle_a",
        adjustments: [
          { item_id: "item_x", amount: 1000 },
          { item_id: "item_y", amount: 1000 },
        ],
      },
      {
        promotion_id: "bundle_b",
        adjustments: [
          { item_id: "item_x", amount: 2000 },
          { item_id: "item_y", amount: 2000 },
        ],
      },
    ]
    const result = resolveExclusiveNonStandard(groups)
    expect(result).toHaveLength(1)
    expect(result[0].promotion_id).toBe("bundle_b")
  })

  it("keeps both promos when they target different items", () => {
    const groups: PromotionAdjustmentGroup[] = [
      {
        promotion_id: "bundle_a",
        adjustments: [{ item_id: "item_x", amount: 1000 }],
      },
      {
        promotion_id: "bundle_b",
        adjustments: [{ item_id: "item_y", amount: 2000 }],
      },
    ]
    const result = resolveExclusiveNonStandard(groups)
    expect(result).toHaveLength(2)
  })

  it("skips entire promo when any of its items are claimed (all-or-nothing)", () => {
    // bundle_a claims item_x and item_y (savings=3000)
    // bundle_b needs item_y and item_z (savings=1500) — item_y claimed → skip all of bundle_b
    const groups: PromotionAdjustmentGroup[] = [
      {
        promotion_id: "bundle_a",
        adjustments: [
          { item_id: "item_x", amount: 2000 },
          { item_id: "item_y", amount: 1000 },
        ],
      },
      {
        promotion_id: "bundle_b",
        adjustments: [
          { item_id: "item_y", amount: 500 },
          { item_id: "item_z", amount: 1000 },
        ],
      },
    ]
    const result = resolveExclusiveNonStandard(groups)
    expect(result).toHaveLength(1)
    expect(result[0].promotion_id).toBe("bundle_a")
  })

  it("returns single promo as-is", () => {
    const groups: PromotionAdjustmentGroup[] = [
      {
        promotion_id: "bundle_a",
        adjustments: [{ item_id: "item_x", amount: 5000 }],
      },
    ]
    const result = resolveExclusiveNonStandard(groups)
    expect(result).toHaveLength(1)
    expect(result[0].promotion_id).toBe("bundle_a")
  })

  it("returns empty for empty input", () => {
    expect(resolveExclusiveNonStandard([])).toHaveLength(0)
  })

  it("skips promos with no adjustments", () => {
    const groups: PromotionAdjustmentGroup[] = [
      { promotion_id: "bundle_a", adjustments: [] },
      {
        promotion_id: "bundle_b",
        adjustments: [{ item_id: "item_x", amount: 1000 }],
      },
    ]
    const result = resolveExclusiveNonStandard(groups)
    expect(result).toHaveLength(1)
    expect(result[0].promotion_id).toBe("bundle_b")
  })
})

// ─── capAdjustmentsToSubtotal ───────────────────────────────────────────────

describe("capAdjustmentsToSubtotal", () => {
  it("scales down non-priority adjustments when total exceeds item subtotal", () => {
    const itemSubtotals = new Map([["item_x", 5000]])
    const priorityAdjustments = [{ item_id: "item_x", amount: 3000 }]
    const otherAdjustments = [
      { item_id: "item_x", amount: 2000, code: "std_a" },
      { item_id: "item_x", amount: 2000, code: "std_b" },
    ]
    // priority: 3000, others: 4000, total: 7000, budget remaining: 2000
    // others scaled to fit: 2000 * (2000/4000) = 1000 each
    const result = capAdjustmentsToSubtotal(itemSubtotals, priorityAdjustments, otherAdjustments)
    const totalForX = result.filter((a) => a.item_id === "item_x").reduce((s, a) => s + a.amount, 0)
    expect(totalForX).toBeLessThanOrEqual(5000)
    expect(totalForX).toBe(5000)
  })

  it("leaves adjustments unchanged when within budget", () => {
    const itemSubtotals = new Map([["item_x", 10000]])
    const priorityAdjustments = [{ item_id: "item_x", amount: 3000 }]
    const otherAdjustments = [
      { item_id: "item_x", amount: 2000, code: "std_a" },
    ]
    const result = capAdjustmentsToSubtotal(itemSubtotals, priorityAdjustments, otherAdjustments)
    const totalForX = result.filter((a) => a.item_id === "item_x").reduce((s, a) => s + a.amount, 0)
    expect(totalForX).toBe(5000)
  })

  it("zeros out other adjustments when priority already consumes full subtotal", () => {
    const itemSubtotals = new Map([["item_x", 5000]])
    const priorityAdjustments = [{ item_id: "item_x", amount: 5000 }]
    const otherAdjustments = [
      { item_id: "item_x", amount: 2000, code: "std_a" },
    ]
    const result = capAdjustmentsToSubtotal(itemSubtotals, priorityAdjustments, otherAdjustments)
    const totalForX = result.filter((a) => a.item_id === "item_x").reduce((s, a) => s + a.amount, 0)
    expect(totalForX).toBe(5000)
  })

  it("handles multiple items independently", () => {
    const itemSubtotals = new Map([["item_x", 5000], ["item_y", 3000]])
    const priorityAdjustments = [
      { item_id: "item_x", amount: 4000 },
      { item_id: "item_y", amount: 1000 },
    ]
    const otherAdjustments = [
      { item_id: "item_x", amount: 3000, code: "std" },
      { item_id: "item_y", amount: 1000, code: "std" },
    ]
    const result = capAdjustmentsToSubtotal(itemSubtotals, priorityAdjustments, otherAdjustments)
    const totalForX = result.filter((a) => a.item_id === "item_x").reduce((s, a) => s + a.amount, 0)
    const totalForY = result.filter((a) => a.item_id === "item_y").reduce((s, a) => s + a.amount, 0)
    expect(totalForX).toBeLessThanOrEqual(5000)
    expect(totalForY).toBeLessThanOrEqual(3000)
    // item_x: priority 4000, remaining 1000, other capped to 1000
    expect(totalForX).toBe(5000)
    // item_y: priority 1000, remaining 2000, other 1000 fits → no cap
    expect(totalForY).toBe(2000)
  })
})
