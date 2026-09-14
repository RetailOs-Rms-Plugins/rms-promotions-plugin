import { computeAdjustmentsForPreviewWorkflow } from "@medusajs/core-flows"
import {
  decideOrderEditRecalc,
  mergePreservedItemAdjustments,
  recalcOrderEditPromotions,
} from "../recalc-order-edit-promotions"

jest.mock("@medusajs/core-flows", () => ({
  computeAdjustmentsForPreviewWorkflow: jest.fn(),
}))

// Fixture is migrationtest order #107, the repro in issue #117. One line at
// 8 ILS with a native `10off` (percentage 10, allocation each). Placed at
// quantity 3, so the row on the order says 2.40. The edit takes the line to
// quantity 7, where the engine computes 5.60.
const ITEM = "ordli_01M1YM7SNXT2JG9XJXSQPDXBST"
const NATIVE = "promo_10off"
const BUNDLE = "promo_bundle_3for50"

const standardPromotions = (ids: string[], codes: string[]) => ({
  ids: new Set(ids),
  codes: new Set(codes),
})

describe("decideOrderEditRecalc", () => {
  const change = { id: "orch_1", carry_over_promotions: null }

  it("recalculates an edit whose order carries a native promotion", () => {
    const decision = decideOrderEditRecalc({
      orderChange: change,
      orderPromotionIds: [NATIVE],
      nonStandardPromotionIds: [],
    })

    expect(decision.recalc).toBe(true)
  })

  it("skips an order with no promotions", () => {
    const decision = decideOrderEditRecalc({
      orderChange: change,
      orderPromotionIds: [],
      nonStandardPromotionIds: [],
    })

    expect(decision.recalc).toBe(false)
  })

  it("skips when there is no active order change to add actions to", () => {
    const decision = decideOrderEditRecalc({
      orderChange: null,
      orderPromotionIds: [NATIVE],
      nonStandardPromotionIds: [],
    })

    expect(decision.recalc).toBe(false)
  })

  it("skips when every promotion on the order is in a non-standard mode", () => {
    // Medusa's engine would price these off `application_method.value`, which
    // ADR-0004 pins at 1 for bundle and buy-get modes. Running it would turn a
    // stale amount into a wrong one, so leave the rows alone.
    const decision = decideOrderEditRecalc({
      orderChange: change,
      orderPromotionIds: [BUNDLE],
      nonStandardPromotionIds: [BUNDLE],
    })

    expect(decision.recalc).toBe(false)
  })

  it("recalculates a mixed order for the sake of its native promotion", () => {
    const decision = decideOrderEditRecalc({
      orderChange: change,
      orderPromotionIds: [NATIVE, BUNDLE],
      nonStandardPromotionIds: [BUNDLE],
    })

    expect(decision.recalc).toBe(true)
  })

  it("recalculates again on a change that already carries promotions over", () => {
    // Idempotent: the flag being set says earlier mutations recomputed, it does
    // not say the actions match the preview this confirm is about to apply.
    const decision = decideOrderEditRecalc({
      orderChange: { id: "orch_1", carry_over_promotions: true },
      orderPromotionIds: [NATIVE],
      nonStandardPromotionIds: [],
    })

    expect(decision.recalc).toBe(true)
  })
})

describe("mergePreservedItemAdjustments", () => {
  it("leaves the engine's row alone when the line carries nothing else", () => {
    const merged = mergePreservedItemAdjustments({
      item_id: ITEM,
      computed: [{ code: "10off", promotion_id: NATIVE, amount: 5.6 }],
      existing: [{ code: "10off", promotion_id: NATIVE, amount: 2.4 }],
      standardPromotions: standardPromotions([NATIVE], ["10off"]),
    })

    expect(merged.differsFromComputed).toBe(false)
    expect(merged.adjustments).toHaveLength(1)
    expect(merged.adjustments[0].amount).toBe(5.6)
  })

  it("keeps a manual adjustment the engine's row would have dropped", () => {
    // An ITEM_ADJUSTMENTS_REPLACE action replaces the line's whole adjustment
    // list, and the engine only ever produces rows for the order's promotions.
    // Without this merge, confirming an edit deletes every operator-created
    // discount on a promoted line.
    const merged = mergePreservedItemAdjustments({
      item_id: ITEM,
      computed: [{ code: "10off", promotion_id: NATIVE, amount: 5.6 }],
      existing: [
        { code: "10off", promotion_id: NATIVE, amount: 2.4 },
        { code: "goodwill-5", promotion_id: null, amount: 5, description: "Goodwill" },
      ],
      standardPromotions: standardPromotions([NATIVE], ["10off"]),
    })

    expect(merged.differsFromComputed).toBe(true)
    expect(merged.adjustments).toHaveLength(2)
    expect(merged.adjustments.map((a) => a.amount).sort()).toEqual([5, 5.6])
    expect(merged.adjustments.find((a) => a.code === "goodwill-5")?.description).toBe("Goodwill")
    expect(merged.adjustments.every((a) => a.item_id === ITEM)).toBe(true)
  })

  it("keeps the plugin's bundle row and drops the engine's figure for it", () => {
    const merged = mergePreservedItemAdjustments({
      item_id: ITEM,
      computed: [
        { code: "10off", promotion_id: NATIVE, amount: 5.6 },
        // what native computeActions makes of a bundle promotion: value 1
        { code: "3for50", promotion_id: BUNDLE, amount: 1 },
      ],
      existing: [
        { code: "10off", promotion_id: NATIVE, amount: 2.4 },
        { code: "3for50", promotion_id: BUNDLE, amount: 30 },
      ],
      standardPromotions: standardPromotions([NATIVE], ["10off"]),
    })

    expect(merged.differsFromComputed).toBe(true)
    expect(merged.adjustments).toHaveLength(2)
    expect(merged.adjustments.find((a) => a.promotion_id === BUNDLE)?.amount).toBe(30)
    expect(merged.adjustments.find((a) => a.promotion_id === NATIVE)?.amount).toBe(5.6)
  })

  it("treats a computed row with no promotion_id as the engine's when its code is on the order", () => {
    // `prepareAdjustmentsFromPromotionActionsStep` resolves promotion_id by
    // code lookup and leaves it undefined if that misses. Matching on code too
    // keeps such a row instead of silently dropping the discount.
    const merged = mergePreservedItemAdjustments({
      item_id: ITEM,
      computed: [{ code: "10off", promotion_id: null, amount: 5.6 }],
      existing: [{ code: "10off", promotion_id: NATIVE, amount: 2.4 }],
      standardPromotions: standardPromotions([NATIVE], ["10off"]),
    })

    expect(merged.differsFromComputed).toBe(false)
    expect(merged.adjustments).toHaveLength(1)
    expect(merged.adjustments[0].amount).toBe(5.6)
  })

  it("drops rows leaked by a rolled-back confirm without adding an action", () => {
    // A line can carry more than one row for the same promotion — haturki #880
    // had five, left by rolled-back confirms. They are all standard-priced, so
    // the engine's single row replaces the lot. That is a side effect of how
    // replace works, not a repair feature: rows for a non-standard promotion
    // are preserved verbatim, duplicates included.
    const merged = mergePreservedItemAdjustments({
      item_id: ITEM,
      computed: [{ code: "10off", promotion_id: NATIVE, amount: 5.6 }],
      existing: [
        { code: "10off", promotion_id: NATIVE, amount: 2.4 },
        { code: "10off", promotion_id: NATIVE, amount: 2.4 },
        { code: "10off", promotion_id: NATIVE, amount: 2.4 },
      ],
      standardPromotions: standardPromotions([NATIVE], ["10off"]),
    })

    expect(merged.differsFromComputed).toBe(false)
    expect(merged.adjustments).toHaveLength(1)
  })

  it("passes a fixed-amount row through the same way as a percentage one", () => {
    // The plugin does no arithmetic here — amounts are whatever Medusa's engine
    // computed, so `fixed` and `percentage` differ only in the number. This
    // pins that the merge is indifferent to the application method.
    const merged = mergePreservedItemAdjustments({
      item_id: ITEM,
      computed: [{ code: "10off", promotion_id: NATIVE, amount: 30.3 }],
      existing: [{ code: "10off", promotion_id: NATIVE, amount: 10.1 }],
      standardPromotions: standardPromotions([NATIVE], ["10off"]),
    })

    // haturki #880's shape: a fixed 10.10 per unit, stale from quantity 1,
    // where the quantity-3 line is worth 30.30.
    expect(merged.adjustments[0].amount).toBe(30.3)
    expect(merged.differsFromComputed).toBe(false)
  })

  it("keeps an across-allocation promotion's row on every line it spread to", () => {
    // `across` splits one promotion's value over the targeted lines, so the
    // same promotion appears once per line with a different amount. Each line
    // is merged on its own, and neither loses its share.
    const OTHER = "ordli_second"
    const first = mergePreservedItemAdjustments({
      item_id: ITEM,
      computed: [{ code: "10off", promotion_id: NATIVE, amount: 3.5 }],
      existing: [{ code: "10off", promotion_id: NATIVE, amount: 1.2 }],
      standardPromotions: standardPromotions([NATIVE], ["10off"]),
    })
    const second = mergePreservedItemAdjustments({
      item_id: OTHER,
      computed: [{ code: "10off", promotion_id: NATIVE, amount: 2.1 }],
      existing: [{ code: "10off", promotion_id: NATIVE, amount: 1.2 }],
      standardPromotions: standardPromotions([NATIVE], ["10off"]),
    })

    expect(first.adjustments).toEqual([
      expect.objectContaining({ item_id: ITEM, amount: 3.5 }),
    ])
    expect(second.adjustments).toEqual([
      expect.objectContaining({ item_id: OTHER, amount: 2.1 }),
    ])
  })

  it("coerces the BigNumber amounts the order module hands back", () => {
    const merged = mergePreservedItemAdjustments({
      item_id: ITEM,
      computed: [{ code: "10off", promotion_id: NATIVE, amount: { valueOf: () => 5.6 } }],
      existing: [{ code: "goodwill-5", promotion_id: null, amount: "5" }],
      standardPromotions: standardPromotions([NATIVE], ["10off"]),
    })

    expect(merged.adjustments.find((a) => a.code === "10off")?.amount).toBe(5.6)
    expect(merged.adjustments.find((a) => a.code === "goodwill-5")?.amount).toBe(5)
  })

  it("keeps a standard row the engine said nothing about", () => {
    // Found by probing a real order: a promotion the engine does not price —
    // because it is draft, expired, or its context could not be built — comes
    // back with no computed row at all. Dropping the existing row there zeroes
    // a discount the customer was already given, silently, on an edit that had
    // nothing to do with it. That is the same harm as the bug being fixed, in
    // the other direction, so an unpriced promotion keeps what it has.
    const merged = mergePreservedItemAdjustments({
      item_id: ITEM,
      computed: [],
      existing: [{ code: "10off", promotion_id: NATIVE, amount: 2.4 }],
      standardPromotions: standardPromotions([NATIVE], ["10off"]),
    })

    expect(merged.adjustments).toEqual([
      expect.objectContaining({ code: "10off", amount: 2.4 }),
    ])
    // and our action has to be written, or Medusa's own replace wipes the row
    expect(merged.differsFromComputed).toBe(true)
  })

  it("replaces only the promotions the engine actually priced", () => {
    const OTHER_PROMO = "promo_20off"
    const merged = mergePreservedItemAdjustments({
      item_id: ITEM,
      computed: [{ code: "10off", promotion_id: NATIVE, amount: 5.6 }],
      existing: [
        { code: "10off", promotion_id: NATIVE, amount: 2.4 },
        { code: "20off", promotion_id: OTHER_PROMO, amount: 4.8 },
      ],
      standardPromotions: standardPromotions([NATIVE, OTHER_PROMO], ["10off", "20off"]),
    })

    // 10off was priced, so its stale row goes. 20off was not, so its row stays.
    expect(merged.adjustments).toEqual([
      expect.objectContaining({ code: "10off", amount: 5.6 }),
      expect.objectContaining({ code: "20off", amount: 4.8 }),
    ])
  })

  it("still collapses duplicate rows for a promotion the engine did price", () => {
    const merged = mergePreservedItemAdjustments({
      item_id: ITEM,
      computed: [{ code: "10off", promotion_id: NATIVE, amount: 5.6 }],
      existing: [
        { code: "10off", promotion_id: NATIVE, amount: 2.4 },
        { code: "10off", promotion_id: NATIVE, amount: 2.4 },
      ],
      standardPromotions: standardPromotions([NATIVE], ["10off"]),
    })

    expect(merged.adjustments).toHaveLength(1)
    expect(merged.adjustments[0].amount).toBe(5.6)
    expect(merged.differsFromComputed).toBe(false)
  })

  it("preserves a row whose promotion is not on the order at all", () => {
    // Only what the engine was asked to compute is the engine's to replace.
    const merged = mergePreservedItemAdjustments({
      item_id: ITEM,
      computed: [{ code: "10off", promotion_id: NATIVE, amount: 5.6 }],
      existing: [{ code: "ghost", promotion_id: "promo_gone", amount: 1 }],
      standardPromotions: standardPromotions([NATIVE], ["10off"]),
    })

    expect(merged.differsFromComputed).toBe(true)
    expect(merged.adjustments.map((a) => a.code)).toEqual(["10off", "ghost"])
  })

  it("carries is_tax_inclusive across, defaulting to false", () => {
    const merged = mergePreservedItemAdjustments({
      item_id: ITEM,
      computed: [{ code: "10off", promotion_id: NATIVE, amount: 5.6, is_tax_inclusive: true }],
      existing: [{ code: "goodwill-5", promotion_id: null, amount: 5 }],
      standardPromotions: standardPromotions([NATIVE], ["10off"]),
    })

    expect(merged.adjustments.find((a) => a.code === "10off")?.is_tax_inclusive).toBe(true)
    expect(merged.adjustments.find((a) => a.code === "goodwill-5")?.is_tax_inclusive).toBe(false)
  })
})

describe("recalcOrderEditPromotions", () => {
  const ORDER = "order_01M1YM7SNXT2JG9XJXSQPDXBST"
  const CHANGE = "orch_107"

  /**
   * The order as issue #117 left it: quantity 7 at 8 ILS, with the discount
   * still recorded at 2.40, the figure from when it was placed at quantity 3.
   * The preview is what Medusa's engine writes once it is allowed to run —
   * 5.60 — plus whatever the merge pass has to put back.
   */
  const createMockContainer = (opts: {
    promotions?: { id: string; code: string }[]
    configs?: any[]
    carryOver?: boolean | null
    /** rows on the order line right now */
    orderAdjustments?: any[]
    /** rows the preview shows after the engine's REPLACE action */
    previewAdjustments?: any[]
  } = {}) => {
    const calls: string[] = []
    const orderChangeFilters: any[] = []

    const promotions = opts.promotions ?? [{ id: NATIVE, code: "10off" }]
    const orderAdjustments = opts.orderAdjustments ?? [
      { id: "ordliadj_old", code: "10off", promotion_id: NATIVE, amount: 2.4 },
    ]
    const previewAdjustments = opts.previewAdjustments ?? [
      { code: "10off", promotion_id: NATIVE, amount: 5.6 },
    ]

    const query = {
      graph: jest.fn().mockImplementation(({ entity, filters }: { entity: string; filters: any }) => {
        if (entity === "order") {
          return Promise.resolve({
            data: [{ id: ORDER, currency_code: "ils", promotions }],
          })
        }
        if (entity === "order_change") {
          orderChangeFilters.push(filters)
          return Promise.resolve({
            data: [{ id: CHANGE, version: 3, carry_over_promotions: opts.carryOver ?? null }],
          })
        }
        return Promise.resolve({ data: [] })
      }),
    }

    const orderModule = {
      updateOrderChanges: jest.fn().mockImplementation((data: any) => {
        calls.push("updateOrderChanges")
        return Promise.resolve(data)
      }),
      retrieveOrder: jest.fn().mockImplementation(() => {
        calls.push("retrieveOrder")
        return Promise.resolve({
          id: ORDER,
          items: [{ id: ITEM, adjustments: orderAdjustments }],
        })
      }),
      previewOrderChange: jest.fn().mockImplementation(() => {
        calls.push("previewOrderChange")
        return Promise.resolve({
          id: ORDER,
          items: [{ id: ITEM, quantity: 7, adjustments: previewAdjustments }],
        })
      }),
      addOrderAction: jest.fn().mockImplementation((data: any) => {
        calls.push("addOrderAction")
        return Promise.resolve(data)
      }),
    }

    const service = {
      listPromotionExtConfigs: jest.fn().mockResolvedValue(opts.configs ?? []),
    }

    const run = jest.fn().mockImplementation(() => {
      calls.push("computeAdjustments")
      return Promise.resolve({ result: undefined })
    })
    ;(computeAdjustmentsForPreviewWorkflow as unknown as jest.Mock).mockReturnValue({ run })

    const locking = {
      execute: jest.fn().mockImplementation((key: string, job: () => Promise<void>) => {
        calls.push(`lock:${key}`)
        return job()
      }),
    }

    const container = {
      resolve: jest.fn().mockImplementation((key: string) => {
        if (key === "query") return query
        if (key === "order") return orderModule
        if (key === "promotion_ext") return service
        if (key === "locking") return locking
        if (key === "logger") return { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }
        throw new Error(`unexpected resolve(${key})`)
      }),
    }

    return { container, orderModule, service, locking, run, calls, orderChangeFilters }
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("sets carry_over_promotions before it lets the engine compute", async () => {
    // Order matters: the compute workflow deletes every adjustment-replace
    // action it finds when the flag on the order change is falsy, so computing
    // first would throw away its own result.
    const { container, orderModule, calls } = createMockContainer()

    await recalcOrderEditPromotions(ORDER, container)

    expect(orderModule.updateOrderChanges).toHaveBeenCalledWith({
      id: CHANGE,
      carry_over_promotions: true,
    })
    expect(calls.indexOf("updateOrderChanges")).toBeLessThan(calls.indexOf("computeAdjustments"))
  })

  it("does all of it under the order's lock", async () => {
    // The order-edit mutation workflows write replace actions of their own on
    // this same key. BF-016 is what happens when two writers skip the lock.
    const { container, locking, calls } = createMockContainer()

    await recalcOrderEditPromotions(ORDER, container)

    expect(locking.execute).toHaveBeenCalledTimes(1)
    expect(locking.execute.mock.calls[0][0]).toBe(ORDER)
    expect(locking.execute.mock.calls[0][2]).toEqual({ timeout: 2 })
    expect(calls[0]).toBe(`lock:${ORDER}`)
  })

  it("takes no lock when there is nothing to reprice", async () => {
    const { container, locking } = createMockContainer({ promotions: [] })

    await recalcOrderEditPromotions(ORDER, container)

    expect(locking.execute).not.toHaveBeenCalled()
  })

  it("leaves the engine's action alone when the line holds nothing else", async () => {
    const { container, orderModule, run } = createMockContainer()

    await recalcOrderEditPromotions(ORDER, container)

    expect(run).toHaveBeenCalledTimes(1)
    expect(orderModule.addOrderAction).not.toHaveBeenCalled()
  })

  it("writes a merged replace action that keeps an operator's adjustment", async () => {
    const { container, orderModule } = createMockContainer({
      orderAdjustments: [
        { id: "ordliadj_old", code: "10off", promotion_id: NATIVE, amount: 2.4 },
        { id: "ordliadj_goodwill", code: "goodwill-5", promotion_id: null, amount: 5 },
      ],
    })

    await recalcOrderEditPromotions(ORDER, container)

    expect(orderModule.addOrderAction).toHaveBeenCalledTimes(1)
    const [[actions]] = orderModule.addOrderAction.mock.calls
    expect(actions).toHaveLength(1)
    expect(actions[0]).toMatchObject({
      order_change_id: CHANGE,
      order_id: ORDER,
      version: 3,
      action: "ITEM_ADJUSTMENTS_REPLACE",
    })
    expect(actions[0].details.reference_id).toBe(ITEM)
    expect(actions[0].details.adjustments).toEqual([
      expect.objectContaining({ item_id: ITEM, code: "10off", amount: 5.6 }),
      expect.objectContaining({ item_id: ITEM, code: "goodwill-5", amount: 5 }),
    ])
  })

  it("reads the rows to preserve off the order, not off the preview", async () => {
    // By the time the preview is read, the engine's replace action has already
    // wiped the manual row from it. Reading the preview for both sides would
    // preserve nothing and delete the operator's discount.
    const { container, orderModule } = createMockContainer({
      orderAdjustments: [
        { id: "ordliadj_goodwill", code: "goodwill-5", promotion_id: null, amount: 5 },
      ],
      previewAdjustments: [{ code: "10off", promotion_id: NATIVE, amount: 5.6 }],
    })

    await recalcOrderEditPromotions(ORDER, container)

    expect(orderModule.retrieveOrder).toHaveBeenCalledWith(ORDER, {
      relations: ["items.adjustments"],
    })
    const [[actions]] = orderModule.addOrderAction.mock.calls
    expect(actions[0].details.adjustments.map((a: any) => a.code)).toEqual([
      "10off",
      "goodwill-5",
    ])
  })

  it("does nothing to an order with no promotions", async () => {
    const { container, orderModule, run } = createMockContainer({ promotions: [] })

    await recalcOrderEditPromotions(ORDER, container)

    expect(orderModule.updateOrderChanges).not.toHaveBeenCalled()
    expect(run).not.toHaveBeenCalled()
    expect(orderModule.addOrderAction).not.toHaveBeenCalled()
  })

  it("does nothing when every promotion on the order is in a non-standard mode", async () => {
    const { container, orderModule, run } = createMockContainer({
      promotions: [{ id: BUNDLE, code: "3for50" }],
      configs: [{ promotion_id: BUNDLE, promotion_mode: "bundle" }],
    })

    await recalcOrderEditPromotions(ORDER, container)

    expect(orderModule.updateOrderChanges).not.toHaveBeenCalled()
    expect(run).not.toHaveBeenCalled()
  })

  it("recomputes the native promotion and keeps the plugin's bundle row", async () => {
    const { container, orderModule } = createMockContainer({
      promotions: [
        { id: NATIVE, code: "10off" },
        { id: BUNDLE, code: "3for50" },
      ],
      configs: [{ promotion_id: BUNDLE, promotion_mode: "bundle" }],
      orderAdjustments: [
        { id: "ordliadj_old", code: "10off", promotion_id: NATIVE, amount: 2.4 },
        { id: "ordliadj_bundle", code: "3for50", promotion_id: BUNDLE, amount: 30 },
      ],
      previewAdjustments: [
        { code: "10off", promotion_id: NATIVE, amount: 5.6 },
        // native computeActions prices a bundle promotion off value 1
        { code: "3for50", promotion_id: BUNDLE, amount: 1 },
      ],
    })

    await recalcOrderEditPromotions(ORDER, container)

    const [[actions]] = orderModule.addOrderAction.mock.calls
    expect(actions[0].details.adjustments).toEqual([
      expect.objectContaining({ code: "10off", amount: 5.6 }),
      expect.objectContaining({ code: "3for50", amount: 30 }),
    ])
  })

  it("only looks at an edit's order change", async () => {
    // On an exchange or a claim, `carry_over_promotions` is a toggle the
    // operator sets deliberately. Forcing it true there would override them.
    const { container, orderChangeFilters } = createMockContainer()

    await recalcOrderEditPromotions(ORDER, container)

    expect(orderChangeFilters).toHaveLength(1)
    expect(orderChangeFilters[0]).toMatchObject({
      order_id: ORDER,
      change_type: "edit",
      status: ["pending", "requested"],
    })
  })

  it("skips the flag write when the order change already carries promotions", async () => {
    const { container, orderModule, run } = createMockContainer({ carryOver: true })

    await recalcOrderEditPromotions(ORDER, container)

    expect(orderModule.updateOrderChanges).not.toHaveBeenCalled()
    expect(run).toHaveBeenCalledTimes(1)
  })

  it("does nothing when the order has no active change", async () => {
    const { container, orderModule, run } = createMockContainer()
    ;(container.resolve as jest.Mock).mockImplementation((key: string) => {
      if (key === "query") {
        return {
          graph: jest.fn().mockImplementation(({ entity }: { entity: string }) =>
            entity === "order"
              ? Promise.resolve({ data: [{ id: ORDER, promotions: [{ id: NATIVE, code: "10off" }] }] })
              : Promise.resolve({ data: [] })
          ),
        }
      }
      if (key === "order") return orderModule
      if (key === "promotion_ext") return { listPromotionExtConfigs: jest.fn().mockResolvedValue([]) }
      if (key === "locking") return { execute: jest.fn() }
      if (key === "logger") return { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }
      throw new Error(`unexpected resolve(${key})`)
    })

    await recalcOrderEditPromotions(ORDER, container)

    expect(run).not.toHaveBeenCalled()
    expect(orderModule.updateOrderChanges).not.toHaveBeenCalled()
  })
})
