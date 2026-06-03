import { computeNonStandardAdjustments } from "../compute-non-standard-adjustments"

function createMockContainer(overrides: {
  configs?: any[]
  promotions?: any[]
  cartItems?: any[]
  cartPromotions?: any[]
  cartExtAdjustments?: any[]
  fullCartItems?: any[]
} = {}) {
  const {
    configs = [],
    promotions = [],
    cartItems = [],
    cartPromotions = [],
    cartExtAdjustments = [],
    fullCartItems = [],
  } = overrides

  const deletedExtIds: string[][] = []
  const createdExtAdjs: any[][] = []
  const setLineItemAdjustmentsCalls: any[][] = []

  const service = {
    listPromotionExtConfigs: jest.fn().mockResolvedValue(configs),
    listCartExtAdjustments: jest.fn().mockResolvedValue(cartExtAdjustments),
    deleteCartExtAdjustments: jest.fn().mockImplementation((ids) => {
      deletedExtIds.push(ids)
      return Promise.resolve()
    }),
    createCartExtAdjustments: jest.fn().mockImplementation((adjs) => {
      createdExtAdjs.push(adjs)
      return Promise.resolve(adjs)
    }),
  }

  const cartModule = {
    retrieveCart: jest.fn().mockResolvedValue({
      items: fullCartItems,
    }),
    setLineItemAdjustments: jest.fn().mockImplementation((cartId, adjs) => {
      setLineItemAdjustmentsCalls.push(adjs)
      return Promise.resolve()
    }),
  }

  const queryResponses: Record<string, any> = {
    promotion: { data: promotions },
    cart: { data: [{ items: cartItems, promotions: cartPromotions }] },
  }

  const query = {
    graph: jest.fn().mockImplementation(({ entity }: { entity: string }) => {
      return Promise.resolve(queryResponses[entity] ?? { data: [] })
    }),
  }

  const container = {
    resolve: jest.fn().mockImplementation((key: string) => {
      if (key === "query") return query
      if (key === "promotion_ext") return service
      if (key === "cart") return cartModule
      return undefined
    }),
  }

  return {
    container,
    service,
    cartModule,
    query,
    deletedExtIds,
    createdExtAdjs,
    setLineItemAdjustmentsCalls,
  }
}

describe("computeNonStandardAdjustments", () => {
  it("returns early when no non-standard configs exist", async () => {
    const { container, service } = createMockContainer({
      configs: [{ promotion_id: "promo_1", promotion_mode: "standard" }],
    })

    await computeNonStandardAdjustments("cart_1", container)

    expect(service.listPromotionExtConfigs).toHaveBeenCalled()
    expect(container.resolve("query").graph).not.toHaveBeenCalled()
  })

  it("returns early when configs list is empty", async () => {
    const { container, query } = createMockContainer({ configs: [] })

    await computeNonStandardAdjustments("cart_1", container)

    expect(query.graph).not.toHaveBeenCalled()
  })

  it("cleans up stale ext adjustments when promo is not applied", async () => {
    const { container, service, deletedExtIds } = createMockContainer({
      configs: [{ promotion_id: "promo_1", promotion_mode: "bundle", mode_config: { bundle_size: 3, remainder: "full_price" } }],
      promotions: [{ id: "promo_1", code: "BUNDLE10", application_method: { type: "fixed", value: 5000, target_rules: [] } }],
      cartItems: [{ id: "item_1", unit_price: 2000, quantity: 3, product_id: "prod_1", product: {} }],
      cartPromotions: [],
      cartExtAdjustments: [],
    })

    service.listCartExtAdjustments
      .mockResolvedValueOnce([{ id: "ext_1", cart_id: "cart_1", promotion_id: "promo_1" }])
      .mockResolvedValueOnce([])

    await computeNonStandardAdjustments("cart_1", container, {
      appliedPromotionCodes: [],
    })

    expect(deletedExtIds).toHaveLength(1)
    expect(deletedExtIds[0]).toEqual(["ext_1"])
  })

  it("computes bundle adjustments for applied promo", async () => {
    const { container, createdExtAdjs } = createMockContainer({
      configs: [{ promotion_id: "promo_1", promotion_mode: "bundle", mode_config: { bundle_size: 3, remainder: "full_price" } }],
      promotions: [{ id: "promo_1", code: "BUNDLE10", application_method: { type: "fixed", value: 5000, max_quantity: null, target_rules: [] } }],
      cartItems: [{ id: "item_1", unit_price: 2000, quantity: 3, product_id: "prod_1", product: {} }],
      cartExtAdjustments: [],
      fullCartItems: [],
    })

    await computeNonStandardAdjustments("cart_1", container, {
      appliedPromotionCodes: ["BUNDLE10"],
    })

    expect(createdExtAdjs).toHaveLength(1)
    const adjs = createdExtAdjs[0]
    expect(adjs[0].code).toBe("BUNDLE_BUNDLE10")
    expect(adjs[0].source).toBe("bundle")
    expect(adjs[0].promotion_id).toBe("promo_1")
    const totalAmount = adjs.reduce((sum: number, a: any) => sum + a.amount, 0)
    expect(totalAmount).toBe(1000)
  })

  it("computes buyget_repeat adjustments for applied promo", async () => {
    const { container, createdExtAdjs } = createMockContainer({
      configs: [{ promotion_id: "promo_1", promotion_mode: "buyget_repeat", mode_config: { buy_quantity: 2, get_quantity: 1, discount_target: "cheapest", remainder: "full_price" } }],
      promotions: [{ id: "promo_1", code: "BG_FREE", application_method: { type: "percentage", value: 100, max_quantity: null, target_rules: [] } }],
      cartItems: [{ id: "item_1", unit_price: 3000, quantity: 3, product_id: "prod_1", product: {} }],
      cartExtAdjustments: [],
      fullCartItems: [],
    })

    await computeNonStandardAdjustments("cart_1", container, {
      appliedPromotionCodes: ["BG_FREE"],
    })

    expect(createdExtAdjs).toHaveLength(1)
    const adjs = createdExtAdjs[0]
    expect(adjs[0].code).toBe("BUYGET_REPEAT_BG_FREE")
    expect(adjs[0].source).toBe("buyget_repeat")
    const totalAmount = adjs.reduce((sum: number, a: any) => sum + a.amount, 0)
    expect(totalAmount).toBe(3000)
  })

  it("preserves native adjustments when merging with custom", async () => {
    const nativeAdj = { id: "adj_native", code: "STANDARD10", amount: 500, promotion_id: "promo_standard", description: "10% off", provider_id: null }

    const { container, setLineItemAdjustmentsCalls } = createMockContainer({
      configs: [{ promotion_id: "promo_1", promotion_mode: "bundle", mode_config: { bundle_size: 3, remainder: "full_price" } }],
      promotions: [{ id: "promo_1", code: "BUNDLE10", application_method: { type: "fixed", value: 5000, max_quantity: null, target_rules: [] } }],
      cartItems: [{ id: "item_1", unit_price: 2000, quantity: 3, product_id: "prod_1", product: {} }],
      cartExtAdjustments: [{ id: "ext_1", cart_id: "cart_1", item_id: "item_1", code: "BUNDLE_BUNDLE10", amount: 1000, promotion_id: "promo_1", source: "bundle" }],
      fullCartItems: [{ id: "item_1", adjustments: [nativeAdj] }],
    })

    await computeNonStandardAdjustments("cart_1", container, {
      appliedPromotionCodes: ["BUNDLE10"],
    })

    expect(setLineItemAdjustmentsCalls).toHaveLength(1)
    const finalAdjs = setLineItemAdjustmentsCalls[0]
    const nativeCodes = finalAdjs.filter((a: any) => a.code === "STANDARD10")
    const customCodes = finalAdjs.filter((a: any) => a.code === "BUNDLE_BUNDLE10")
    expect(nativeCodes).toHaveLength(1)
    expect(customCodes).toHaveLength(1)
  })

  it("does not create adjustments when bundle has insufficient items and promo is not applied", async () => {
    const { container, createdExtAdjs } = createMockContainer({
      configs: [{ promotion_id: "promo_1", promotion_mode: "bundle", mode_config: { bundle_size: 5, remainder: "full_price" } }],
      promotions: [{ id: "promo_1", code: "BUNDLE10", application_method: { type: "fixed", value: 5000, max_quantity: null, target_rules: [] } }],
      cartItems: [{ id: "item_1", unit_price: 2000, quantity: 2, product_id: "prod_1", product: {} }],
      cartExtAdjustments: [],
      fullCartItems: [],
    })

    await computeNonStandardAdjustments("cart_1", container, {
      appliedPromotionCodes: [],
    })

    expect(createdExtAdjs).toHaveLength(0)
  })

  it("resolves applied codes from cart when not provided", async () => {
    const { container, query } = createMockContainer({
      configs: [{ promotion_id: "promo_1", promotion_mode: "bundle", mode_config: { bundle_size: 3, remainder: "full_price" } }],
      promotions: [{ id: "promo_1", code: "BUNDLE10", application_method: { type: "fixed", value: 5000, max_quantity: null, target_rules: [] } }],
      cartItems: [{ id: "item_1", unit_price: 2000, quantity: 3, product_id: "prod_1", product: {} }],
      cartPromotions: [{ code: "BUNDLE10" }],
      cartExtAdjustments: [],
      fullCartItems: [],
    })

    await computeNonStandardAdjustments("cart_1", container)

    const graphCalls = query.graph.mock.calls
    const cartCodeFetch = graphCalls.find(
      (call: any) => call[0].entity === "cart" && call[0].fields?.includes("promotions.code")
    )
    expect(cartCodeFetch).toBeDefined()
  })

  it("deduplicates ext adjustments from concurrent invocations", async () => {
    const duplicateExtAdjs = [
      { id: "ext_1", cart_id: "cart_1", item_id: "item_1", code: "BUNDLE_BUNDLE10", amount: 1000, promotion_id: "promo_1", source: "bundle" },
      { id: "ext_2", cart_id: "cart_1", item_id: "item_1", code: "BUNDLE_BUNDLE10", amount: 1000, promotion_id: "promo_1", source: "bundle" },
      { id: "ext_3", cart_id: "cart_1", item_id: "item_1", code: "BUNDLE_BUNDLE10", amount: 1000, promotion_id: "promo_1", source: "bundle" },
      { id: "ext_4", cart_id: "cart_1", item_id: "item_1", code: "BUNDLE_BUNDLE10", amount: 1000, promotion_id: "promo_1", source: "bundle" },
    ]

    const { container, setLineItemAdjustmentsCalls } = createMockContainer({
      configs: [{ promotion_id: "promo_1", promotion_mode: "bundle", mode_config: { bundle_size: 3, remainder: "full_price" } }],
      promotions: [{ id: "promo_1", code: "BUNDLE10", application_method: { type: "fixed", value: 5000, max_quantity: null, target_rules: [] } }],
      cartItems: [{ id: "item_1", unit_price: 2000, quantity: 3, product_id: "prod_1", product: {} }],
      cartExtAdjustments: duplicateExtAdjs,
      fullCartItems: [],
    })

    await computeNonStandardAdjustments("cart_1", container, {
      appliedPromotionCodes: ["BUNDLE10"],
    })

    expect(setLineItemAdjustmentsCalls).toHaveLength(1)
    const finalAdjs = setLineItemAdjustmentsCalls[0]
    const bundleAdjs = finalAdjs.filter((a: any) => a.code === "BUNDLE_BUNDLE10")
    expect(bundleAdjs).toHaveLength(1)
    expect(bundleAdjs[0].amount).toBe(1000)
  })

  it("dedup preserves manual adjustments with null promotion_id", async () => {
    const mixedExtAdjs = [
      { id: "ext_1", cart_id: "cart_1", item_id: "item_1", code: "BUNDLE_BUNDLE10", amount: 1000, promotion_id: "promo_1", source: "bundle" },
      { id: "ext_dup", cart_id: "cart_1", item_id: "item_1", code: "BUNDLE_BUNDLE10", amount: 1000, promotion_id: "promo_1", source: "bundle" },
      { id: "ext_m1", cart_id: "cart_1", item_id: "item_1", code: "MANUAL_abc", amount: 500, promotion_id: null, source: "manual" },
      { id: "ext_m2", cart_id: "cart_1", item_id: "item_1", code: "MANUAL_def", amount: 300, promotion_id: null, source: "manual" },
    ]

    const { container, setLineItemAdjustmentsCalls } = createMockContainer({
      configs: [{ promotion_id: "promo_1", promotion_mode: "bundle", mode_config: { bundle_size: 3, remainder: "full_price" } }],
      promotions: [{ id: "promo_1", code: "BUNDLE10", application_method: { type: "fixed", value: 5000, max_quantity: null, target_rules: [] } }],
      cartItems: [{ id: "item_1", unit_price: 2000, quantity: 3, product_id: "prod_1", product: {} }],
      cartExtAdjustments: mixedExtAdjs,
      fullCartItems: [],
    })

    await computeNonStandardAdjustments("cart_1", container, {
      appliedPromotionCodes: ["BUNDLE10"],
    })

    expect(setLineItemAdjustmentsCalls).toHaveLength(1)
    const finalAdjs = setLineItemAdjustmentsCalls[0]
    const bundleAdjs = finalAdjs.filter((a: any) => a.code === "BUNDLE_BUNDLE10")
    const manualAdjs = finalAdjs.filter((a: any) => a.code?.startsWith("MANUAL_"))
    expect(bundleAdjs).toHaveLength(1)
    expect(manualAdjs).toHaveLength(2)
  })

  it("skips unknown promotion modes and does not create adjustments", async () => {
    const { container, createdExtAdjs } = createMockContainer({
      configs: [{ promotion_id: "promo_1", promotion_mode: "unknown_mode", mode_config: {} }],
      promotions: [{ id: "promo_1", code: "UNKNOWN", application_method: { type: "fixed", value: 100, target_rules: [] } }],
      cartItems: [{ id: "item_1", unit_price: 2000, quantity: 3, product_id: "prod_1", product: {} }],
      cartExtAdjustments: [],
      fullCartItems: [],
    })

    await computeNonStandardAdjustments("cart_1", container, {
      appliedPromotionCodes: [],
    })

    expect(createdExtAdjs).toHaveLength(0)
  })
})
