import { planOrderAdjustmentRepair } from "../plan-order-adjustment-repair"

// Fixture is haturki order #880, read from production on 2026-09-07.
// Two promoted lines, five adjustment rows each: one from the order-edit
// confirm that succeeded at 10:32:32, four left behind by confirms that
// failed and rolled back at 10:26:16, 10:26:22, 10:26:28 and 10:27:19.
const SHERIDANS = "ordli_01M1TNKYSHKYW5QWQYCRW9CMVT"
const BAILEYS = "ordli_01M1TNKYSJP8FQ1ADXN4ME1BBN"
const PROMO_SHERIDANS = "promo_01KZJP833HH44526339XMVJ8WR"
const PROMO_BAILEYS = "promo_01KZJP82XCJ85HY1AAP9WB0TZ3"

const order880 = () => [
  {
    id: SHERIDANS,
    title: 'ליקר שרידנס 700 מ"ל',
    quantity: 3,
    unit_price: 110,
    adjustments: [
      { id: "ordliadj_01M1XPF0QV614T4JDX87HYSAX8", promotion_id: PROMO_SHERIDANS, amount: 10.1, version: 2, created_at: "2026-09-07T10:26:16" },
      { id: "ordliadj_01M1XPF6EFH6BVY6YDTPJXWRRP", promotion_id: PROMO_SHERIDANS, amount: 10.1, version: 2, created_at: "2026-09-07T10:26:22" },
      { id: "ordliadj_01M1XPFCEJ64MHDFYYNBVSF8N4", promotion_id: PROMO_SHERIDANS, amount: 10.1, version: 2, created_at: "2026-09-07T10:26:28" },
      { id: "ordliadj_01M1XPGYRM4FX3RH76P3WVTMGX", promotion_id: PROMO_SHERIDANS, amount: 10.1, version: 2, created_at: "2026-09-07T10:27:19" },
      { id: "ordliadj_01M1XPTFXK2S8VCNNXZZYPEBVD", promotion_id: PROMO_SHERIDANS, amount: 10.1, version: 2, created_at: "2026-09-07T10:32:32" },
    ],
  },
  {
    id: BAILEYS,
    title: 'ליקר בייליס 700 מ"ל',
    quantity: 1,
    unit_price: 89,
    adjustments: [
      { id: "ordliadj_01M1XPF0QVP2HTWAXVV99500HD", promotion_id: PROMO_BAILEYS, amount: 19.1, version: 2, created_at: "2026-09-07T10:26:16" },
      { id: "ordliadj_01M1XPF6EF78A6K84S859P81SP", promotion_id: PROMO_BAILEYS, amount: 19.1, version: 2, created_at: "2026-09-07T10:26:22" },
      { id: "ordliadj_01M1XPFCEJBPPZHY9334FPDBNQ", promotion_id: PROMO_BAILEYS, amount: 19.1, version: 2, created_at: "2026-09-07T10:26:28" },
      { id: "ordliadj_01M1XPGYRMFN2WNJZRYJEZSQMN", promotion_id: PROMO_BAILEYS, amount: 19.1, version: 2, created_at: "2026-09-07T10:27:19" },
      { id: "ordliadj_01M1XPTFXK1WWJ4PXHEHQEACVH", promotion_id: PROMO_BAILEYS, amount: 19.1, version: 2, created_at: "2026-09-07T10:32:32" },
    ],
  },
  // three lines with no promotion — must be ignored entirely
  { id: "ordli_mollys", title: "ליקר מוליס", quantity: 1, unit_price: 99, adjustments: [] },
  { id: "ordli_amarula_coffee", title: "אמרולה קפה", quantity: 1, unit_price: 85, adjustments: [] },
  { id: "ordli_amarula_vanilla", title: "אמרולה וניל", quantity: 1, unit_price: 85, adjustments: null },
]

describe("planOrderAdjustmentRepair", () => {
  it("finds both leaked groups on order #880 and no others", () => {
    const plan = planOrderAdjustmentRepair(order880())

    expect(plan.duplicate_groups).toHaveLength(2)
    expect(plan.clean_group_count).toBe(0)
    expect(plan.recorded_discount_total).toBeCloseTo(146.0, 2)
    expect(plan.deletable_ids).toHaveLength(8)
  })

  it("keeps the newest row in each group and offers the rest", () => {
    const plan = planOrderAdjustmentRepair(order880())
    const sheridans = plan.duplicate_groups.find((g) => g.item_id === SHERIDANS)!

    expect(sheridans.keep_id).toBe("ordliadj_01M1XPTFXK2S8VCNNXZZYPEBVD")
    expect(sheridans.deletable_ids).not.toContain(sheridans.keep_id)
    expect(sheridans.deletable_ids[0]).toBe("ordliadj_01M1XPF0QV614T4JDX87HYSAX8")
    expect(sheridans.row_count).toBe(5)
    expect(sheridans.recorded_discount).toBeCloseTo(50.5, 2)
    expect(sheridans.amount_per_row).toBeCloseTo(10.1, 2)
  })

  it("deleting the six ids the operator chose lands on 638.60", () => {
    // Sheridans keeps 3 rows (quantity 3 x 10.10 = 30.30),
    // Baileys keeps 1 (19.10). Subtotal 688.00 - 49.40 = 638.60.
    const chosen = new Set([
      "ordliadj_01M1XPF0QV614T4JDX87HYSAX8",
      "ordliadj_01M1XPF6EFH6BVY6YDTPJXWRRP",
      "ordliadj_01M1XPF0QVP2HTWAXVV99500HD",
      "ordliadj_01M1XPF6EF78A6K84S859P81SP",
      "ordliadj_01M1XPFCEJBPPZHY9334FPDBNQ",
      "ordliadj_01M1XPGYRMFN2WNJZRYJEZSQMN",
    ])
    const plan = planOrderAdjustmentRepair(order880())

    // every chosen id must be one the route is willing to delete
    for (const id of chosen) {
      expect(plan.deletable_ids).toContain(id)
    }

    const lines = order880()
    const subtotal = lines.reduce((s, l) => s + (l.unit_price ?? 0) * (l.quantity ?? 0), 0)
    const remaining = lines
      .flatMap((l) => l.adjustments ?? [])
      .filter((a) => !chosen.has(a.id))
      .reduce((s, a) => s + Number(a.amount), 0)

    expect(subtotal).toBeCloseTo(688.0, 2)
    expect(remaining).toBeCloseTo(49.4, 2)
    expect(subtotal - remaining).toBeCloseTo(638.6, 2)
  })

  it("never offers a group's only row", () => {
    const plan = planOrderAdjustmentRepair([
      {
        id: "ordli_healthy",
        title: "one promo, one row",
        quantity: 2,
        unit_price: 50,
        adjustments: [
          { id: "ordliadj_ok", promotion_id: "promo_x", amount: 12.5, created_at: "2026-09-01T00:00:00" },
        ],
      },
    ])

    expect(plan.duplicate_groups).toHaveLength(0)
    expect(plan.deletable_ids).toEqual([])
    expect(plan.clean_group_count).toBe(1)
  })

  it("separates two different promotions on the same line", () => {
    const plan = planOrderAdjustmentRepair([
      {
        id: "ordli_two_promos",
        title: "stacked",
        quantity: 1,
        unit_price: 100,
        adjustments: [
          { id: "a1", promotion_id: "promo_a", amount: 5, created_at: "2026-09-01T00:00:01" },
          { id: "a2", promotion_id: "promo_a", amount: 5, created_at: "2026-09-01T00:00:02" },
          { id: "b1", promotion_id: "promo_b", amount: 7, created_at: "2026-09-01T00:00:03" },
        ],
      },
    ])

    expect(plan.duplicate_groups).toHaveLength(1)
    expect(plan.duplicate_groups[0].promotion_id).toBe("promo_a")
    expect(plan.deletable_ids).toEqual(["a1"])
    expect(plan.clean_group_count).toBe(1)
  })

  it("falls back to code when promotion_id is missing, and tolerates string amounts", () => {
    const plan = planOrderAdjustmentRepair([
      {
        id: "ordli_coded",
        title: "code only",
        quantity: 1,
        unit_price: 100,
        adjustments: [
          { id: "c1", promotion_id: null, code: "SUMMER", amount: "9.9", created_at: "2026-09-01T00:00:01" },
          { id: "c2", promotion_id: null, code: "SUMMER", amount: "9.9", created_at: "2026-09-01T00:00:02" },
        ],
      },
    ])

    expect(plan.duplicate_groups).toHaveLength(1)
    expect(plan.duplicate_groups[0].code).toBe("SUMMER")
    expect(plan.duplicate_groups[0].recorded_discount).toBeCloseTo(19.8, 2)
    expect(plan.deletable_ids).toEqual(["c1"])
  })

  it("orders by ulid when created_at is absent", () => {
    const plan = planOrderAdjustmentRepair([
      {
        id: "ordli_no_dates",
        title: "no timestamps",
        quantity: 1,
        unit_price: 100,
        adjustments: [
          { id: "ordliadj_01M1XPTFXK_newest", promotion_id: "promo_z", amount: 3 },
          { id: "ordliadj_01M1XPF0QV_oldest", promotion_id: "promo_z", amount: 3 },
        ],
      },
    ])

    expect(plan.duplicate_groups[0].keep_id).toBe("ordliadj_01M1XPTFXK_newest")
    expect(plan.deletable_ids).toEqual(["ordliadj_01M1XPF0QV_oldest"])
  })

  it("returns an empty plan for an order with no lines", () => {
    expect(planOrderAdjustmentRepair([])).toEqual({
      duplicate_groups: [],
      clean_group_count: 0,
      deletable_ids: [],
      recorded_discount_total: 0,
    })
  })
})
