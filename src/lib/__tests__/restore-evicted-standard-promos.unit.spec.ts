import { restoreEvictedStandardPromos } from "../restore-evicted-standard-promos"

jest.mock("../cart-enricher", () => ({
  loadConfigShape: jest.fn().mockResolvedValue({
    include_groups_combinator: "or",
    exclude_groups_combinator: "or",
    rule_groups: [],
  }),
  buildEnrichedCart: jest.fn().mockResolvedValue({
    subtotal: 3000,
    totalQuantity: 3,
    items: [{ product_id: "prod_1", totalQuantity: 3 }],
  }),
  passesNativeRules: jest.fn().mockReturnValue(true),
}))

jest.mock("../rule-evaluator", () => ({
  evaluatePromotion: jest.fn().mockReturnValue(true),
}))

const { passesNativeRules } = require("../cart-enricher")
const { evaluatePromotion } = require("../rule-evaluator")

interface MockOverrides {
  autoApplyConfigs?: any[]
  cartPromotions?: any[]
  standardPromos?: any[]
  cartItems?: any[]
  computeActionsResult?: any[]
}

function createMockContainer(overrides: MockOverrides = {}) {
  const {
    autoApplyConfigs = [],
    cartPromotions = [],
    standardPromos = [],
    cartItems = [],
    computeActionsResult = [],
  } = overrides

  const linkCreated: any[][] = []

  const service = {
    listPromotionExtConfigs: jest.fn().mockResolvedValue(autoApplyConfigs),
  }

  const remoteLink = {
    create: jest.fn().mockImplementation((links) => {
      linkCreated.push(links)
      return Promise.resolve(links.map((_: any, i: number) => ({ id: `link_${i}` })))
    }),
  }

  const promotionService = {
    computeActions: jest.fn().mockResolvedValue(computeActionsResult),
  }

  const freshCartItems = cartItems.map((item: any) => ({
    ...item,
    subtotal: item.unit_price * item.quantity,
    original_total: item.unit_price * item.quantity,
    is_discountable: true,
    adjustments: [{ id: "adj_existing", code: "BUNDLE", amount: 100 }],
    tax_lines: [],
    product: { id: item.product_id ?? "prod_1" },
    variant: { id: "var_1", product: { id: item.product_id ?? "prod_1" } },
  }))

  const queryResponses: Record<string, any[]> = {
    cart_main: [{ id: "cart_1", promotions: cartPromotions, items: cartItems, region_id: "reg_1", sales_channel_id: "sc_1", currency_code: "eur", customer_id: null }],
    promotion: standardPromos,
    cart_fresh: [{ id: "cart_1", currency_code: "eur", region_id: "reg_1", sales_channel_id: "sc_1", items: freshCartItems, shipping_methods: [], customer: null }],
  }

  let cartQueryCount = 0
  const query = {
    graph: jest.fn().mockImplementation(({ entity, fields }: { entity: string; fields: string[] }) => {
      if (entity === "promotion") {
        return Promise.resolve({ data: queryResponses.promotion })
      }
      if (entity === "cart") {
        cartQueryCount++
        if (cartQueryCount === 1) {
          return Promise.resolve({ data: queryResponses.cart_main })
        }
        return Promise.resolve({ data: queryResponses.cart_fresh })
      }
      return Promise.resolve({ data: [] })
    }),
  }

  const container = {
    resolve: jest.fn().mockImplementation((key: string) => {
      if (key === "query") return query
      if (key === "promotion_ext") return service
      if (key === "link") return remoteLink
      if (key === "promotion") return promotionService
      return undefined
    }),
  }

  return { container, service, remoteLink, promotionService, query, linkCreated }
}

describe("restoreEvictedStandardPromos", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    passesNativeRules.mockReturnValue(true)
    evaluatePromotion.mockReturnValue(true)
  })

  it("returns empty when no standard auto-apply configs exist", async () => {
    const { container } = createMockContainer({
      autoApplyConfigs: [
        { promotion_id: "promo_bundle", promotion_mode: "bundle", auto_apply: true },
      ],
    })

    const result = await restoreEvictedStandardPromos("cart_1", new Set(["promo_bundle"]), container)

    expect(result).toEqual([])
  })

  it("returns empty when standard promo is already linked to cart", async () => {
    const { container, remoteLink } = createMockContainer({
      autoApplyConfigs: [
        { promotion_id: "promo_std", promotion_mode: "standard", auto_apply: true },
      ],
      cartPromotions: [{ id: "promo_std", code: "10OFF" }],
      standardPromos: [{ id: "promo_std", code: "10OFF", status: "active" }],
    })

    const result = await restoreEvictedStandardPromos("cart_1", new Set(), container)

    expect(result).toEqual([])
    expect(remoteLink.create).not.toHaveBeenCalled()
  })

  it("restores evicted standard promo with fresh adjustments", async () => {
    const { container, remoteLink, promotionService } = createMockContainer({
      autoApplyConfigs: [
        { promotion_id: "promo_std", promotion_mode: "standard", auto_apply: true },
      ],
      cartPromotions: [],
      standardPromos: [
        { id: "promo_std", code: "10OFF", status: "active", starts_at: null, ends_at: null, is_tax_inclusive: false, rules: [] },
      ],
      cartItems: [
        { id: "item_1", unit_price: 1000, quantity: 3, product_id: "prod_1" },
      ],
      computeActionsResult: [
        { action: "addItemAdjustment", item_id: "item_1", amount: 300, code: "10OFF" },
      ],
    })

    const result = await restoreEvictedStandardPromos("cart_1", new Set(["promo_bundle"]), container)

    expect(remoteLink.create).toHaveBeenCalledTimes(1)
    expect(remoteLink.create).toHaveBeenCalledWith([
      expect.objectContaining({ cart: { cart_id: "cart_1" }, promotion: { promotion_id: "promo_std" } }),
    ])

    expect(promotionService.computeActions).toHaveBeenCalledTimes(1)
    expect(promotionService.computeActions).toHaveBeenCalledWith(
      ["10OFF"],
      expect.objectContaining({
        items: expect.arrayContaining([expect.objectContaining({ adjustments: [] })]),
        shipping_methods: expect.arrayContaining([]),
      }),
      { prevent_auto_promotions: true }
    )

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      item_id: "item_1",
      code: "10OFF",
      amount: 300,
      is_tax_inclusive: false,
      promotion_id: "promo_std",
    })
  })

  it("skips inactive promos (expired)", async () => {
    const { container, remoteLink } = createMockContainer({
      autoApplyConfigs: [
        { promotion_id: "promo_std", promotion_mode: "standard", auto_apply: true },
      ],
      cartPromotions: [],
      standardPromos: [
        { id: "promo_std", code: "10OFF", status: "active", starts_at: null, ends_at: "2020-01-01T00:00:00Z", rules: [] },
      ],
    })

    const result = await restoreEvictedStandardPromos("cart_1", new Set(), container)

    expect(result).toEqual([])
    expect(remoteLink.create).not.toHaveBeenCalled()
  })

  it("skips promos that fail native rules", async () => {
    passesNativeRules.mockReturnValue(false)

    const { container, remoteLink } = createMockContainer({
      autoApplyConfigs: [
        { promotion_id: "promo_std", promotion_mode: "standard", auto_apply: true },
      ],
      cartPromotions: [],
      standardPromos: [
        { id: "promo_std", code: "10OFF", status: "active", starts_at: null, ends_at: null, rules: [{ attribute: "currency_code", operator: "eq", values: [{ value: "usd" }] }] },
      ],
    })

    const result = await restoreEvictedStandardPromos("cart_1", new Set(), container)

    expect(result).toEqual([])
    expect(remoteLink.create).not.toHaveBeenCalled()
  })

  it("skips promos that fail ext rule evaluation", async () => {
    evaluatePromotion.mockReturnValue(false)

    const { container, remoteLink } = createMockContainer({
      autoApplyConfigs: [
        { promotion_id: "promo_std", promotion_mode: "standard", auto_apply: true },
      ],
      cartPromotions: [],
      standardPromos: [
        { id: "promo_std", code: "10OFF", status: "active", starts_at: null, ends_at: null, rules: [] },
      ],
    })

    const result = await restoreEvictedStandardPromos("cart_1", new Set(), container)

    expect(result).toEqual([])
    expect(remoteLink.create).not.toHaveBeenCalled()
  })

  it("only extracts addItemAdjustment actions, ignores remove actions", async () => {
    const { container } = createMockContainer({
      autoApplyConfigs: [
        { promotion_id: "promo_std", promotion_mode: "standard", auto_apply: true },
      ],
      cartPromotions: [],
      standardPromos: [
        { id: "promo_std", code: "10OFF", status: "active", starts_at: null, ends_at: null, is_tax_inclusive: false, rules: [] },
      ],
      cartItems: [
        { id: "item_1", unit_price: 1000, quantity: 3, product_id: "prod_1" },
      ],
      computeActionsResult: [
        { action: "removeItemAdjustment", adjustment_id: "adj_old", code: "10OFF" },
        { action: "addItemAdjustment", item_id: "item_1", amount: 300, code: "10OFF" },
        { action: "addShippingMethodAdjustment", shipping_method_id: "sm_1", amount: 50, code: "10OFF" },
      ],
    })

    const result = await restoreEvictedStandardPromos("cart_1", new Set(["promo_bundle"]), container)

    expect(result).toHaveLength(1)
    expect(result[0].item_id).toBe("item_1")
    expect(result[0].amount).toBe(300)
  })

  it("restores multiple evicted standard promos", async () => {
    const { container, remoteLink } = createMockContainer({
      autoApplyConfigs: [
        { promotion_id: "promo_10off", promotion_mode: "standard", auto_apply: true },
        { promotion_id: "promo_5off", promotion_mode: "standard", auto_apply: true },
      ],
      cartPromotions: [],
      standardPromos: [
        { id: "promo_10off", code: "10OFF", status: "active", starts_at: null, ends_at: null, is_tax_inclusive: false, rules: [] },
        { id: "promo_5off", code: "5OFF", status: "active", starts_at: null, ends_at: null, is_tax_inclusive: true, rules: [] },
      ],
      cartItems: [
        { id: "item_1", unit_price: 1000, quantity: 3, product_id: "prod_1" },
      ],
      computeActionsResult: [
        { action: "addItemAdjustment", item_id: "item_1", amount: 300, code: "10OFF" },
        { action: "addItemAdjustment", item_id: "item_1", amount: 150, code: "5OFF" },
      ],
    })

    const result = await restoreEvictedStandardPromos("cart_1", new Set(["promo_bundle"]), container)

    expect(remoteLink.create).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ promotion: { promotion_id: "promo_10off" } }),
        expect.objectContaining({ promotion: { promotion_id: "promo_5off" } }),
      ])
    )

    expect(result).toHaveLength(2)
    expect(result.find((a) => a.code === "10OFF")?.amount).toBe(300)
    expect(result.find((a) => a.code === "5OFF")?.amount).toBe(150)
    expect(result.find((a) => a.code === "5OFF")?.is_tax_inclusive).toBe(true)
  })

  it("treats configs with no promotion_mode as standard", async () => {
    const { container, promotionService } = createMockContainer({
      autoApplyConfigs: [
        { promotion_id: "promo_std", auto_apply: true },
      ],
      cartPromotions: [],
      standardPromos: [
        { id: "promo_std", code: "10OFF", status: "active", starts_at: null, ends_at: null, is_tax_inclusive: false, rules: [] },
      ],
      cartItems: [
        { id: "item_1", unit_price: 1000, quantity: 3, product_id: "prod_1" },
      ],
      computeActionsResult: [
        { action: "addItemAdjustment", item_id: "item_1", amount: 300, code: "10OFF" },
      ],
    })

    const result = await restoreEvictedStandardPromos("cart_1", new Set(), container)

    expect(result).toHaveLength(1)
    expect(promotionService.computeActions).toHaveBeenCalled()
  })
})
