import { calculateCartSubtotal } from "../threshold-promotion-subscriber"

describe("calculateCartSubtotal", () => {
  it("sums unit_price * quantity for each item", () => {
    const items = [
      { unit_price: 50, quantity: 2 },
      { unit_price: 30, quantity: 1 },
    ]
    expect(calculateCartSubtotal(items)).toBe(130)
  })

  it("returns 0 for an empty cart", () => {
    expect(calculateCartSubtotal([])).toBe(0)
  })

  it("handles a single item with quantity 1", () => {
    expect(calculateCartSubtotal([{ unit_price: 100, quantity: 1 }])).toBe(100)
  })

  it("handles fractional prices", () => {
    const items = [
      { unit_price: 9.99, quantity: 3 },
      { unit_price: 0.01, quantity: 1 },
    ]
    expect(calculateCartSubtotal(items)).toBeCloseTo(29.98)
  })
})
