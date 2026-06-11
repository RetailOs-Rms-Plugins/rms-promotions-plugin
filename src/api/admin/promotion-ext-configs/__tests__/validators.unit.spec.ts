import { AdminCreatePromotionExtConfigSchema } from "../validators"

describe("AdminCreatePromotionExtConfigSchema — bundle_size validation", () => {
  const baseBundle = {
    promotion_id: "promo_1",
    promotion_mode: "bundle" as const,
  }

  it("accepts bundle_size=1", () => {
    const result = AdminCreatePromotionExtConfigSchema.safeParse({
      ...baseBundle,
      mode_config: { bundle_size: 1, remainder: "full_price" },
    })
    expect(result.success).toBe(true)
  })

  it("accepts bundle_size=2", () => {
    const result = AdminCreatePromotionExtConfigSchema.safeParse({
      ...baseBundle,
      mode_config: { bundle_size: 2, remainder: "full_price" },
    })
    expect(result.success).toBe(true)
  })

  it("rejects bundle_size=0", () => {
    const result = AdminCreatePromotionExtConfigSchema.safeParse({
      ...baseBundle,
      mode_config: { bundle_size: 0, remainder: "full_price" },
    })
    expect(result.success).toBe(false)
  })

  it("rejects negative bundle_size", () => {
    const result = AdminCreatePromotionExtConfigSchema.safeParse({
      ...baseBundle,
      mode_config: { bundle_size: -1, remainder: "full_price" },
    })
    expect(result.success).toBe(false)
  })
})
