import { AdminAddCustomItemToOrderEditSchema } from "../validators"

describe("AdminAddCustomItemToOrderEditSchema", () => {
  it("accepts a valid payload with title, unit_price, and quantity", () => {
    const result = AdminAddCustomItemToOrderEditSchema.safeParse({
      title: "10% off",
      unit_price: -2000,
      quantity: 1,
    })
    expect(result.success).toBe(true)
  })

  it("rejects missing title", () => {
    const result = AdminAddCustomItemToOrderEditSchema.safeParse({
      unit_price: -2000,
      quantity: 1,
    })
    expect(result.success).toBe(false)
  })

  it("rejects missing unit_price", () => {
    const result = AdminAddCustomItemToOrderEditSchema.safeParse({
      title: "10% off",
      quantity: 1,
    })
    expect(result.success).toBe(false)
  })

  it("rejects non-string title", () => {
    const result = AdminAddCustomItemToOrderEditSchema.safeParse({
      title: 123,
      unit_price: -2000,
      quantity: 1,
    })
    expect(result.success).toBe(false)
  })

  it("rejects non-number unit_price", () => {
    const result = AdminAddCustomItemToOrderEditSchema.safeParse({
      title: "10% off",
      unit_price: "not a number",
      quantity: 1,
    })
    expect(result.success).toBe(false)
  })

  it("accepts negative unit_price", () => {
    const result = AdminAddCustomItemToOrderEditSchema.safeParse({
      title: "10% off",
      unit_price: -5000,
      quantity: 1,
    })
    expect(result.success).toBe(true)
  })

  it("defaults quantity to 1 when omitted", () => {
    const result = AdminAddCustomItemToOrderEditSchema.safeParse({
      title: "10% off",
      unit_price: -2000,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.quantity).toBe(1)
    }
  })

  it("accepts quantity > 1", () => {
    const result = AdminAddCustomItemToOrderEditSchema.safeParse({
      title: "Gift wrapping",
      unit_price: 500,
      quantity: 3,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.quantity).toBe(3)
    }
  })

  it("rejects quantity of 0", () => {
    const result = AdminAddCustomItemToOrderEditSchema.safeParse({
      title: "10% off",
      unit_price: -2000,
      quantity: 0,
    })
    expect(result.success).toBe(false)
  })

  it("rejects negative quantity", () => {
    const result = AdminAddCustomItemToOrderEditSchema.safeParse({
      title: "10% off",
      unit_price: -2000,
      quantity: -1,
    })
    expect(result.success).toBe(false)
  })
})
