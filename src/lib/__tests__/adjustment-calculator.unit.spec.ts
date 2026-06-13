import { computeBundle, computeBuyGetRepeat, resolveExclusiveNonStandard, capAdjustmentsToSubtotal, type EligibleItem, type BuyGetRepeatModeConfig, type BundleModeConfig, type PromotionAdjustmentGroup } from "../adjustment-calculator"

const makeItems = (items: { id: string; unit_price: number; quantity: number; subtotal?: number }[]): EligibleItem[] =>
  items.map((i) => ({ ...i, subtotal: i.subtotal ?? i.unit_price * i.quantity }))

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
    expect(totalAdjustment).toBeCloseTo(3000, 10)
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
  it("caps non-priority adjustments sequentially when total exceeds item subtotal", () => {
    const itemSubtotals = new Map([["item_x", 5000]])
    const priorityAdjustments = [{ item_id: "item_x", amount: 3000 }]
    const otherAdjustments = [
      { item_id: "item_x", amount: 2000, code: "std_a" },
      { item_id: "item_x", amount: 2000, code: "std_b" },
    ]
    // priority: 3000, remaining: 2000
    // sorted: std_a(2000), std_b(2000) — same value, first gets full 2000, second gets 0
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

  it("no rounding loss — sequential capping uses full remaining budget", () => {
    const itemSubtotals = new Map([["item_x", 100]])
    const priorityAdjustments: { item_id: string; amount: number }[] = []
    const otherAdjustments = [
      { item_id: "item_x", amount: 33, code: "std_a" },
      { item_id: "item_x", amount: 33, code: "std_b" },
      { item_id: "item_x", amount: 35, code: "std_c" },
    ]
    // total others: 101, exceeds subtotal 100
    // sorted: std_c(35), std_a(33), std_b(33)
    // std_c: min(35, 100) = 35, remaining = 65
    // std_a: min(33, 65) = 33, remaining = 32
    // std_b: min(33, 32) = 32, remaining = 0
    // total = 35 + 33 + 32 = 100 — exact, no rounding loss
    const result = capAdjustmentsToSubtotal(itemSubtotals, priorityAdjustments, otherAdjustments)
    const totalForX = result.filter((a) => a.item_id === "item_x").reduce((s, a) => s + a.amount, 0)
    expect(totalForX).toBe(100)
  })

  it("highest-value adjustment gets priority when budget is tight", () => {
    const itemSubtotals = new Map([["item_x", 50]])
    const priorityAdjustments = [{ item_id: "item_x", amount: 30 }]
    const otherAdjustments = [
      { item_id: "item_x", amount: 10, code: "std_small" },
      { item_id: "item_x", amount: 25, code: "std_large" },
    ]
    // remaining after priority: 20
    // sorted: std_large(25), std_small(10)
    // std_large: min(25, 20) = 20, remaining = 0
    // std_small: min(10, 0) = 0 → filtered out (BF-012)
    const result = capAdjustmentsToSubtotal(itemSubtotals, priorityAdjustments, otherAdjustments)
    const large = result.find((a) => (a as any).code === "std_large")
    const small = result.find((a) => (a as any).code === "std_small")
    expect(large?.amount).toBe(20)
    expect(small).toBeUndefined()
    const totalForX = result.filter((a) => a.item_id === "item_x").reduce((s, a) => s + a.amount, 0)
    expect(totalForX).toBe(50)
  })

  it("BF-012: filters out zero-amount adjustments when budget is fully consumed by priority", () => {
    const itemSubtotals = new Map([["item_x", 1000]])
    const priorityAdjustments = [{ item_id: "item_x", amount: 1000 }]
    const otherAdjustments = [
      { item_id: "item_x", amount: 500, code: "std_a" },
      { item_id: "item_x", amount: 300, code: "std_b" },
    ]
    const result = capAdjustmentsToSubtotal(itemSubtotals, priorityAdjustments, otherAdjustments)
    expect(result).toHaveLength(1)
    expect(result[0].amount).toBe(1000)
  })

  it("BF-012: filters out zero-amount adjustments when earlier standards exhaust budget", () => {
    const itemSubtotals = new Map([["item_x", 1750]])
    const priorityAdjustments: { item_id: string; amount: number }[] = []
    const otherAdjustments = [
      { item_id: "item_x", amount: 1000, code: "33off1", promotion_id: "p1" },
      { item_id: "item_x", amount: 750, code: "33off1", promotion_id: "p1" },
      { item_id: "item_x", amount: 1000, code: "33off2", promotion_id: "p2" },
      { item_id: "item_x", amount: 750, code: "33off2", promotion_id: "p2" },
    ]
    // sorted: 1000(p1), 1000(p2), 750(p1), 750(p2)
    // 1000(p1): min(1000, 1750) = 1000, remaining = 750
    // 1000(p2): min(1000, 750) = 750, remaining = 0
    // 750(p1): min(750, 0) = 0 → filtered
    // 750(p2): min(750, 0) = 0 → filtered
    const result = capAdjustmentsToSubtotal(itemSubtotals, priorityAdjustments, otherAdjustments)
    expect(result).toHaveLength(2)
    const totalForX = result.reduce((s, a) => s + a.amount, 0)
    expect(totalForX).toBe(1750)
  })

  it("BF-012: does not filter adjustments with positive amount after capping", () => {
    const itemSubtotals = new Map([
      ["item_a", 1000],
      ["item_b", 750],
    ])
    const priorityAdjustments: { item_id: string; amount: number }[] = []
    const otherAdjustments = [
      { item_id: "item_a", amount: 1000, code: "33off1" },
      { item_id: "item_b", amount: 750, code: "33off2" },
    ]
    const result = capAdjustmentsToSubtotal(itemSubtotals, priorityAdjustments, otherAdjustments)
    expect(result).toHaveLength(2)
    expect(result.find((a) => (a as any).code === "33off1")?.amount).toBe(1000)
    expect(result.find((a) => (a as any).code === "33off2")?.amount).toBe(750)
  })
})

// ─── BF-010: Tax basis + no Math.floor ─────────────────────────────────────

describe("BF-010: computeBundle uses correct tax basis", () => {
  const bundleConfig: BundleModeConfig = { bundle_size: 2, remainder: "full_price" }

  it("uses tax-inclusive unit_price when is_tax_inclusive=true", () => {
    // Items: tax-inclusive price 10, tax-exclusive subtotal 8.4746 (18% VAT)
    const items = makeItems([
      { id: "item_a", unit_price: 10, quantity: 1, subtotal: 8.4746 },
      { id: "item_b", unit_price: 7.5, quantity: 1, subtotal: 6.3559 },
    ])
    // Bundle "2 for 5" tax-inclusive → uses unit_price (10 + 7.5 = 17.5), savings = 12.5
    const result = computeBundle("promo_1", items, bundleConfig, { value: 5, is_tax_inclusive: true })
    const total = result.adjustments.reduce((s, a) => s + a.amount, 0)
    expect(total).toBeCloseTo(12.5, 4)
  })

  it("uses tax-exclusive subtotal when is_tax_inclusive=false", () => {
    const items = makeItems([
      { id: "item_a", unit_price: 10, quantity: 1, subtotal: 8.4746 },
      { id: "item_b", unit_price: 7.5, quantity: 1, subtotal: 6.3559 },
    ])
    // Bundle "2 for 5" tax-exclusive → uses subtotal/qty (8.4746 + 6.3559 = 14.8305), savings = 9.8305
    const result = computeBundle("promo_1", items, bundleConfig, { value: 5, is_tax_inclusive: false })
    const total = result.adjustments.reduce((s, a) => s + a.amount, 0)
    expect(total).toBeCloseTo(9.8305, 3)
  })

  it("does not floor — preserves non-integer amounts exactly", () => {
    const items = makeItems([
      { id: "item_a", unit_price: 7.5, quantity: 2, subtotal: 12.7118 },
    ])
    // bundle_size=2, value=5, tax-inclusive → uses unit_price
    // group: 7.5 + 7.5 = 15, savings = 10
    // each unit: 10 * (7.5/15) = 5.0 exactly (no floor needed)
    const result = computeBundle("promo_1", items, bundleConfig, { value: 5, is_tax_inclusive: true })
    const total = result.adjustments.reduce((s, a) => s + a.amount, 0)
    expect(total).toBe(10)
  })
})

describe("BF-010: computeBuyGetRepeat uses correct tax basis", () => {
  const b2g1Config: BuyGetRepeatModeConfig = {
    buy_quantity: 2,
    get_quantity: 1,
    discount_target: "cheapest",
    remainder: "full_price",
  }

  it("percentage always uses tax-exclusive subtotal", () => {
    // 7.50 tax-incl, 6.3559 tax-excl (18% VAT), qty=3
    const items = makeItems([
      { id: "item_a", unit_price: 7.5, quantity: 3, subtotal: 19.0678 },
    ])
    // buy 2 get 1 free (100%), cheapest = tax-exclusive unit = 6.3559
    const result = computeBuyGetRepeat("promo_1", items, b2g1Config, { type: "percentage", value: 100 })
    const total = result.adjustments.reduce((s, a) => s + a.amount, 0)
    // subtotal/qty = 19.0678/3 = 6.3559
    expect(total).toBeCloseTo(6.3559, 3)
  })

  it("percentage does NOT use tax-inclusive price (would cause negative total)", () => {
    const items = makeItems([
      { id: "item_a", unit_price: 7.5, quantity: 3, subtotal: 19.0678 },
    ])
    const result = computeBuyGetRepeat("promo_1", items, b2g1Config, { type: "percentage", value: 100 })
    const total = result.adjustments.reduce((s, a) => s + a.amount, 0)
    // Must be less than unit_price (7.5), not equal — tax-exclusive basis
    expect(total).toBeLessThan(7.5)
  })

  it("fixed with is_tax_inclusive=true uses tax-inclusive unit_price", () => {
    const items = makeItems([
      { id: "item_a", unit_price: 10, quantity: 3, subtotal: 25.4237 },
    ])
    // fixed 5 off, tax-inclusive → uses unit_price (10), discount = min(5, 10) = 5
    const result = computeBuyGetRepeat("promo_1", items, b2g1Config, {
      type: "fixed", value: 5, is_tax_inclusive: true,
    })
    const total = result.adjustments.reduce((s, a) => s + a.amount, 0)
    expect(total).toBe(5)
  })

  it("fixed with is_tax_inclusive=false uses tax-exclusive subtotal", () => {
    const items = makeItems([
      { id: "item_a", unit_price: 10, quantity: 3, subtotal: 25.4237 },
    ])
    // fixed 5 off, not tax-inclusive → uses subtotal/qty = 8.4746
    const result = computeBuyGetRepeat("promo_1", items, b2g1Config, {
      type: "fixed", value: 5, is_tax_inclusive: false,
    })
    const total = result.adjustments.reduce((s, a) => s + a.amount, 0)
    expect(total).toBe(5)
  })

  it("does not floor — preserves fractional discount amounts", () => {
    // 7.50 tax-incl, subtotal = 19.0678 for qty 3
    const items = makeItems([
      { id: "item_a", unit_price: 7.5, quantity: 3, subtotal: 19.0678 },
    ])
    // 50% off cheapest → 6.3559 * 0.5 = 3.1780 (not floor to 3)
    const result = computeBuyGetRepeat("promo_1", items, b2g1Config, { type: "percentage", value: 50 })
    const total = result.adjustments.reduce((s, a) => s + a.amount, 0)
    expect(total).toBeCloseTo(3.178, 2)
    // Verify it's NOT an integer (old Math.floor would give 3)
    expect(total % 1).not.toBe(0)
  })
})
