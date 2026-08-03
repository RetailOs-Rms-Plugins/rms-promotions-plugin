import { enrichCartPromotionsWithAutoApply } from "../enrich-cart-promotions"
import { PROMOTION_EXT_MODULE } from "../../modules/promotion-ext/constants"

function createMockContainer(configs: any[] = []) {
  const service = {
    listPromotionExtConfigs: jest.fn().mockResolvedValue(configs),
  }

  const container = {
    resolve: jest.fn().mockImplementation((key: string) => {
      if (key === PROMOTION_EXT_MODULE) return service
      throw new Error(`Unknown key: ${key}`)
    }),
  }

  return { container, service }
}

describe("enrichCartPromotionsWithAutoApply", () => {
  it("attaches auto_apply: true on cart.promotions when config exists", async () => {
    const cart: any = {
      promotions: [{ id: "promo_1" }],
      items: [],
    }
    const { container } = createMockContainer([
      { promotion_id: "promo_1", auto_apply: true },
    ])

    await enrichCartPromotionsWithAutoApply(cart, container)

    expect(cart.promotions[0].auto_apply).toBe(true)
  })

  it("attaches auto_apply: false when no config found for a promotion", async () => {
    const cart: any = {
      promotions: [{ id: "promo_1" }],
      items: [],
    }
    const { container } = createMockContainer([])

    await enrichCartPromotionsWithAutoApply(cart, container)

    expect(cart.promotions[0].auto_apply).toBe(false)
  })

  it("enriches promotions nested in cart.items[].adjustments[].promotion", async () => {
    const cart: any = {
      promotions: [],
      items: [
        {
          adjustments: [
            { promotion: { id: "promo_2" } },
            { promotion: { id: "promo_3" } },
          ],
        },
      ],
    }
    const { container } = createMockContainer([
      { promotion_id: "promo_2", auto_apply: true },
      { promotion_id: "promo_3", auto_apply: false },
    ])

    await enrichCartPromotionsWithAutoApply(cart, container)

    expect(cart.items[0].adjustments[0].promotion.auto_apply).toBe(true)
    expect(cart.items[0].adjustments[1].promotion.auto_apply).toBe(false)
  })

  it("no-ops when cart has no promotions and no items", async () => {
    const cart: any = {
      promotions: [],
      items: [],
    }
    const { container, service } = createMockContainer([])

    await enrichCartPromotionsWithAutoApply(cart, container)

    expect(service.listPromotionExtConfigs).not.toHaveBeenCalled()
  })

  it("bulk-queries once with all unique promotion IDs", async () => {
    const cart: any = {
      promotions: [{ id: "promo_1" }, { id: "promo_2" }],
      items: [
        {
          adjustments: [
            { promotion: { id: "promo_2" } },
            { promotion: { id: "promo_3" } },
          ],
        },
      ],
    }
    const { container, service } = createMockContainer([
      { promotion_id: "promo_1", auto_apply: true },
      { promotion_id: "promo_2", auto_apply: false },
      { promotion_id: "promo_3", auto_apply: true },
    ])

    await enrichCartPromotionsWithAutoApply(cart, container)

    expect(service.listPromotionExtConfigs).toHaveBeenCalledTimes(1)
    const filterArg = service.listPromotionExtConfigs.mock.calls[0][0]
    expect(filterArg.promotion_id).toEqual(
      expect.arrayContaining(["promo_1", "promo_2", "promo_3"])
    )
    expect(filterArg.promotion_id).toHaveLength(3)
  })
})
