/**
 * Regression: a manually entered coupon code must still discount a line that
 * already carries a non-standard (bundle / buy-get) promotion.
 *
 * haturki, Asana 1217457334283775. Numbers come from the measured production
 * cart cart_01M05AGMYFNATQ1CEKA4MEEK9G: a wine line of 69 x 2 under a
 * "2 for 129.90" bundle, plus a typed 50%-of-order coupon that discounted
 * nothing.
 *
 * Mechanism (same one ADR-0009 describes for auto-apply promos): Medusa's
 * computeActions shares one budget map, sorted by application_method.value
 * descending. The bundle's native value (129.90) exceeds the line subtotal, so
 * the budget is empty by the time the coupon (value 50) is computed and the
 * coupon produces no adjustment. restoreEvictedStandardPromos only looks at
 * listPromotionExtConfigs({ auto_apply: true }), so a typed coupon is never
 * recomputed on a clean budget.
 *
 * Expected amount matches what the plugin already gives an auto-apply
 * percentage promo: computed clean (50% of 138 = 69), then scaled by the share
 * of the line the bundle did not consume ((138 - 8.10) / 138), which comes out
 * at 50% of the bundle price.
 */

import { computeNonStandardAdjustments } from "../compute-non-standard-adjustments"

const CART_ID = "cart_01M05AGMYFNATQ1CEKA4MEEK9G"
const ITEM_ID = "cali_wine"
const BUNDLE_PROMO_ID = "promo_bundle_2for12990"
const COUPON_PROMO_ID = "promo_w123"
const COUPON_CODE = "w123"

const UNIT_PRICE = 69
const QUANTITY = 2
const LINE_SUBTOTAL = UNIT_PRICE * QUANTITY // 138
const BUNDLE_PRICE = 129.9
const BUNDLE_SAVING = LINE_SUBTOTAL - BUNDLE_PRICE // 8.10
const COUPON_CLEAN_AMOUNT = LINE_SUBTOTAL * 0.5 // 69, what a clean budget yields
const EXPECTED_COUPON = BUNDLE_PRICE * 0.5 // 64.95

function createMockContainer(opts: { starvedCouponAmount?: number } = {}) {
  const setLineItemAdjustmentsCalls: any[][] = []

  const service = {
    // The bundle promo has a config. The typed coupon has none, which is what a
    // plain coupon looks like — auto_apply reads as false.
    listPromotionExtConfigs: jest.fn().mockImplementation((filters: any) => {
      const bundleConfig = {
        promotion_id: BUNDLE_PROMO_ID,
        auto_apply: true,
        promotion_mode: "bundle",
        mode_config: { bundle_size: QUANTITY, remainder: "full_price" },
      }
      if (filters?.auto_apply === true) return Promise.resolve([bundleConfig])
      return Promise.resolve([bundleConfig])
    }),
    listCartExtAdjustments: jest.fn().mockResolvedValue([
      {
        id: "cea_bundle",
        cart_id: CART_ID,
        item_id: ITEM_ID,
        promotion_id: BUNDLE_PROMO_ID,
        code: "BUNDLE_2FOR12990",
        amount: BUNDLE_SAVING,
        is_tax_inclusive: false,
        source: "bundle",
      },
    ]),
    deleteCartExtAdjustments: jest.fn().mockResolvedValue(undefined),
    createCartExtAdjustments: jest.fn().mockImplementation((a) => Promise.resolve(a)),
  }

  const cartModule = {
    // What Medusa left on the cart: the bundle's native adjustment, and no
    // coupon adjustment at all because its budget was already spent.
    retrieveCart: jest.fn().mockResolvedValue({
      items: [
        {
          id: ITEM_ID,
          unit_price: UNIT_PRICE,
          quantity: QUANTITY,
          is_tax_inclusive: false,
          tax_lines: [],
          adjustments: [
            {
              id: "caliadj_bundle_native",
              code: "BUNDLE_2FOR12990",
              amount: BUNDLE_SAVING,
              promotion_id: BUNDLE_PROMO_ID,
              is_tax_inclusive: false,
            },
            // On haturki's real cart the coupon did land on one line, at a
            // scrap of what it was worth. The starved amount must not win.
            ...(opts.starvedCouponAmount != null
              ? [
                  {
                    id: "caliadj_coupon_starved",
                    code: COUPON_CODE,
                    amount: opts.starvedCouponAmount,
                    promotion_id: COUPON_PROMO_ID,
                    is_tax_inclusive: false,
                  },
                ]
              : []),
          ],
        },
      ],
    }),
    setLineItemAdjustments: jest.fn().mockImplementation((_cartId, adjs) => {
      setLineItemAdjustmentsCalls.push(adjs)
      return Promise.resolve()
    }),
  }

  const promotions = [
    {
      id: BUNDLE_PROMO_ID,
      code: "BUNDLE_2FOR12990",
      is_tax_inclusive: false,
      status: "active",
      application_method: {
        type: "fixed",
        value: BUNDLE_PRICE,
        max_quantity: QUANTITY,
        target_rules: [],
      },
    },
    {
      id: COUPON_PROMO_ID,
      code: COUPON_CODE,
      is_tax_inclusive: false,
      status: "active",
      application_method: { type: "percentage", value: 50, target_rules: [] },
    },
  ]

  const cartData = [
    {
      id: CART_ID,
      currency_code: "ils",
      region_id: "reg_1",
      sales_channel_id: "sc_1",
      customer_id: null,
      items: [
        {
          id: ITEM_ID,
          unit_price: UNIT_PRICE,
          quantity: QUANTITY,
          is_tax_inclusive: false,
          tax_lines: [],
          product_id: "prod_wine",
          product: { id: "prod_wine", categories: [], tags: [] },
          adjustments: [],
        },
      ],
      // Both codes are linked. The coupon was accepted, it just did nothing.
      promotions: [
        { id: BUNDLE_PROMO_ID, code: "BUNDLE_2FOR12990" },
        { id: COUPON_PROMO_ID, code: COUPON_CODE },
      ],
      shipping_methods: [],
      customer: null,
    },
  ]

  const query = {
    graph: jest.fn().mockImplementation(({ entity }: { entity: string }) => {
      if (entity === "promotion") return Promise.resolve({ data: promotions })
      if (entity === "cart") return Promise.resolve({ data: cartData })
      return Promise.resolve({ data: [] })
    }),
  }

  // A clean-budget computeActions gives the coupon its full 50%.
  const promotionService = {
    computeActions: jest.fn().mockResolvedValue([
      {
        action: "addItemAdjustment",
        item_id: ITEM_ID,
        code: COUPON_CODE,
        amount: COUPON_CLEAN_AMOUNT,
      },
    ]),
  }

  const remoteLink = {
    create: jest.fn().mockResolvedValue([]),
    dismiss: jest.fn().mockResolvedValue([]),
  }

  const container = {
    resolve: jest.fn().mockImplementation((key: string) => {
      if (key === "query") return query
      if (key === "promotion_ext") return service
      if (key === "cart") return cartModule
      if (key === "promotion") return promotionService
      if (key === "link") return remoteLink
      return undefined
    }),
  }

  return { container, setLineItemAdjustmentsCalls, promotionService }
}

describe("typed coupon starved by a bundle promotion (Asana 1217457334283775)", () => {
  it("writes a coupon adjustment worth 50% of the bundle price", async () => {
    const { container, setLineItemAdjustmentsCalls } = createMockContainer()

    await computeNonStandardAdjustments(CART_ID, container)

    expect(setLineItemAdjustmentsCalls).toHaveLength(1)
    const written = setLineItemAdjustmentsCalls[0]

    const couponAmount = written
      .filter((a: any) => a.promotion_id === COUPON_PROMO_ID)
      .reduce((sum: number, a: any) => sum + Number(a.amount), 0)

    expect(couponAmount).toBeCloseTo(EXPECTED_COUPON, 2)
  })

  it("leaves the bundle saving intact", async () => {
    const { container, setLineItemAdjustmentsCalls } = createMockContainer()

    await computeNonStandardAdjustments(CART_ID, container)

    const bundleAmount = setLineItemAdjustmentsCalls[0]
      .filter((a: any) => a.promotion_id === BUNDLE_PROMO_ID)
      .reduce((sum: number, a: any) => sum + Number(a.amount), 0)

    expect(bundleAmount).toBeCloseTo(BUNDLE_SAVING, 2)
  })

  it("replaces a starved coupon amount instead of keeping it", async () => {
    // 6.53 is what production actually wrote on the אברלור line.
    const { container, setLineItemAdjustmentsCalls } = createMockContainer({
      starvedCouponAmount: 6.5318,
    })

    await computeNonStandardAdjustments(CART_ID, container)

    const couponAdjs = setLineItemAdjustmentsCalls[0].filter(
      (a: any) => a.promotion_id === COUPON_PROMO_ID
    )
    expect(couponAdjs).toHaveLength(1)
    expect(Number(couponAdjs[0].amount)).toBeCloseTo(EXPECTED_COUPON, 2)
  })

  it("recomputes the coupon on a clean budget rather than trusting Medusa's starved amount", async () => {
    const { container, promotionService } = createMockContainer()

    await computeNonStandardAdjustments(CART_ID, container)

    expect(promotionService.computeActions).toHaveBeenCalled()
    const [codes] = promotionService.computeActions.mock.calls[0]
    expect(codes).toContain(COUPON_CODE)
  })
})
