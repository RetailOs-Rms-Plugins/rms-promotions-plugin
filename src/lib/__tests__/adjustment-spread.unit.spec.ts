import { spreadCartAdjustment } from "../adjustment-spread"

describe("spreadCartAdjustment", () => {
  it("spreads proportionally by subtotal share", () => {
    const items = [
      { id: "item_a", subtotal: 10000 },
      { id: "item_b", subtotal: 3000 },
    ]
    const result = spreadCartAdjustment(2000, items)

    expect(result).toHaveLength(2)
    const aAmount = result.find((r) => r.item_id === "item_a")!.amount
    const bAmount = result.find((r) => r.item_id === "item_b")!.amount

    // item_a: 10000/13000 * 2000 = 1538.46 → 1538
    // item_b: remainder → 462
    expect(aAmount + bAmount).toBe(2000)
    expect(aAmount).toBeGreaterThan(bAmount)
  })

  it("splits evenly when subtotals are equal", () => {
    const items = [
      { id: "item_a", subtotal: 5000 },
      { id: "item_b", subtotal: 5000 },
    ]
    const result = spreadCartAdjustment(2000, items)

    expect(result.find((r) => r.item_id === "item_a")!.amount).toBe(1000)
    expect(result.find((r) => r.item_id === "item_b")!.amount).toBe(1000)
  })

  it("rounding remainder goes to last item — total always exact", () => {
    const items = [
      { id: "item_a", subtotal: 3333 },
      { id: "item_b", subtotal: 3333 },
      { id: "item_c", subtotal: 3334 },
    ]
    const result = spreadCartAdjustment(1000, items)
    const total = result.reduce((sum, r) => sum + r.amount, 0)

    expect(total).toBe(1000)
    expect(result).toHaveLength(3)
  })

  it("caps at cart subtotal when adjustment exceeds it", () => {
    const items = [
      { id: "item_a", subtotal: 1000 },
      { id: "item_b", subtotal: 500 },
    ]
    const result = spreadCartAdjustment(5000, items)
    const total = result.reduce((sum, r) => sum + r.amount, 0)

    expect(total).toBe(1500)
  })

  it("returns empty array for empty items", () => {
    const result = spreadCartAdjustment(2000, [])
    expect(result).toEqual([])
  })

  it("single item gets the full amount", () => {
    const items = [{ id: "item_a", subtotal: 8000 }]
    const result = spreadCartAdjustment(2000, items)

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ item_id: "item_a", amount: 2000 })
  })

  it("handles negative amounts (surcharges) proportionally", () => {
    const items = [
      { id: "item_a", subtotal: 10000 },
      { id: "item_b", subtotal: 5000 },
    ]
    const result = spreadCartAdjustment(-3000, items)
    const total = result.reduce((sum, r) => sum + r.amount, 0)

    expect(total).toBe(-3000)
    expect(result.every((r) => r.amount < 0)).toBe(true)
  })
})
