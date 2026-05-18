import {
  evaluatePromotion,
  type EnrichedCart,
  type PromotionExtConfigShape,
} from "../rule-evaluator"

const baseCart = (): EnrichedCart => ({
  subtotal: 0,
  totalQuantity: 0,
  items: [],
})

const includeGroup = (
  rules: PromotionExtConfigShape["rule_groups"][0]["rules"],
  rules_combinator: "and" | "or" = "and"
) => ({ type: "include" as const, rules_combinator, rules })

const excludeGroup = (
  rules: PromotionExtConfigShape["rule_groups"][0]["rules"],
  rules_combinator: "and" | "or" = "and"
) => ({ type: "exclude" as const, rules_combinator, rules })

const config = (
  groups: PromotionExtConfigShape["rule_groups"],
  include_groups_combinator: "and" | "or" = "or",
  exclude_groups_combinator: "and" | "or" = "or"
): PromotionExtConfigShape => ({ rule_groups: groups, include_groups_combinator, exclude_groups_combinator })

// ─── comparison: subtotal ────────────────────────────────────────────────────

describe("evaluatePromotion — subtotal", () => {
  it("passes when subtotal meets gte threshold", () => {
    const cart = { ...baseCart(), subtotal: 300 }
    const result = evaluatePromotion(
      config([includeGroup([{ rule_type: "comparison", config: { field: "subtotal", operator: "gte", value: 300 } }])]),
      cart
    )
    expect(result).toBe(true)
  })

  it("fails when subtotal is below gte threshold", () => {
    const cart = { ...baseCart(), subtotal: 299 }
    const result = evaluatePromotion(
      config([includeGroup([{ rule_type: "comparison", config: { field: "subtotal", operator: "gte", value: 300 } }])]),
      cart
    )
    expect(result).toBe(false)
  })

  it("passes when subtotal is within a range (AND within group)", () => {
    const cart = { ...baseCart(), subtotal: 400 }
    const result = evaluatePromotion(
      config([
        includeGroup([
          { rule_type: "comparison", config: { field: "subtotal", operator: "gte", value: 300 } },
          { rule_type: "comparison", config: { field: "subtotal", operator: "lte", value: 500 } },
        ]),
      ]),
      cart
    )
    expect(result).toBe(true)
  })

  it("fails when subtotal exceeds max in AND group", () => {
    const cart = { ...baseCart(), subtotal: 600 }
    const result = evaluatePromotion(
      config([
        includeGroup([
          { rule_type: "comparison", config: { field: "subtotal", operator: "gte", value: 300 } },
          { rule_type: "comparison", config: { field: "subtotal", operator: "lte", value: 500 } },
        ]),
      ]),
      cart
    )
    expect(result).toBe(false)
  })
})

// ─── comparison: totalQuantity ───────────────────────────────────────────────

describe("evaluatePromotion — totalQuantity", () => {
  it("passes when total quantity meets gte threshold", () => {
    const cart = { ...baseCart(), totalQuantity: 3}
    expect(
      evaluatePromotion(
        config([includeGroup([{ rule_type: "comparison", config: { field: "totalQuantity", operator: "gte", value: 2 } }])]),
        cart
      )
    ).toBe(true)
  })

  it("fails when total quantity is below threshold", () => {
    const cart = { ...baseCart(), totalQuantity: 1}
    expect(
      evaluatePromotion(
        config([includeGroup([{ rule_type: "comparison", config: { field: "totalQuantity", operator: "gte", value: 2 } }])]),
        cart
      )
    ).toBe(false)
  })
})

// ─── comparison: quantityOfProduct ───────────────────────────────────────────

describe("evaluatePromotion — quantityOfProduct", () => {
  const cartWithProducts = (): EnrichedCart => ({
    ...baseCart(),
    items: [
      { product_id: "prod_shirt", totalQuantity: 3 },
      { product_id: "prod_pants", totalQuantity: 1 },
    ],
  })

  it("passes when product quantity meets threshold", () => {
    expect(
      evaluatePromotion(
        config([
          includeGroup([
            {
              rule_type: "comparison",
              config: { field: "quantityOfProduct", operator: "gte", value: 3, scope: { product_id: "prod_shirt" } },
            },
          ]),
        ]),
        cartWithProducts()
      )
    ).toBe(true)
  })

  it("fails when product quantity is below threshold", () => {
    expect(
      evaluatePromotion(
        config([
          includeGroup([
            {
              rule_type: "comparison",
              config: { field: "quantityOfProduct", operator: "gte", value: 4, scope: { product_id: "prod_shirt" } },
            },
          ]),
        ]),
        cartWithProducts()
      )
    ).toBe(false)
  })

  it("returns 0 for product not in cart", () => {
    expect(
      evaluatePromotion(
        config([
          includeGroup([
            {
              rule_type: "comparison",
              config: { field: "quantityOfProduct", operator: "gte", value: 1, scope: { product_id: "prod_hat" } },
            },
          ]),
        ]),
        cartWithProducts()
      )
    ).toBe(false)
  })
})

// ─── comparison: quantityOfCollection ────────────────────────────────────────

describe("evaluatePromotion — quantityOfCollection", () => {
  const cartWithCollections = (): EnrichedCart => ({
    ...baseCart(),
    items: [
      { product_id: "prod_a", totalQuantity: 2, product_collection_id: "col_summer" },
      { product_id: "prod_b", totalQuantity: 1, product_collection_id: "col_summer" },
      { product_id: "prod_c", totalQuantity: 5, product_collection_id: "col_winter" },
    ],
  })

  it("passes when collection quantity meets threshold", () => {
    expect(
      evaluatePromotion(
        config([
          includeGroup([
            {
              rule_type: "comparison",
              config: { field: "quantityOfCollection", operator: "gte", value: 3, scope: { collection_id: "col_summer" } },
            },
          ]),
        ]),
        cartWithCollections()
      )
    ).toBe(true)
  })

  it("fails when collection quantity is below threshold", () => {
    expect(
      evaluatePromotion(
        config([
          includeGroup([
            {
              rule_type: "comparison",
              config: { field: "quantityOfCollection", operator: "gte", value: 4, scope: { collection_id: "col_summer" } },
            },
          ]),
        ]),
        cartWithCollections()
      )
    ).toBe(false)
  })
})

// ─── comparison: usesPerCustomer ──────────────────────────────────────────────

describe("evaluatePromotion — usesPerCustomer", () => {
  it("passes when customer has used promotion fewer times than limit", () => {
    const cart = { ...baseCart(), customer_id: "cust_1", usesPerCustomer: 1 }
    expect(
      evaluatePromotion(
        config([includeGroup([{ rule_type: "comparison", config: { field: "usesPerCustomer", operator: "lt", value: 3 } }])]),
        cart
      )
    ).toBe(true)
  })

  it("fails when customer has reached usage limit", () => {
    const cart = { ...baseCart(), customer_id: "cust_1", usesPerCustomer: 3 }
    expect(
      evaluatePromotion(
        config([includeGroup([{ rule_type: "comparison", config: { field: "usesPerCustomer", operator: "lt", value: 3 } }])]),
        cart
      )
    ).toBe(false)
  })

  it("passes for guest cart (no customer) — optimistic", () => {
    const cart = { ...baseCart() }
    expect(
      evaluatePromotion(
        config([includeGroup([{ rule_type: "comparison", config: { field: "usesPerCustomer", operator: "lt", value: 1 } }])]),
        cart
      )
    ).toBe(true)
  })
})

// ─── comparison: firstOrder ───────────────────────────────────────────────────

describe("evaluatePromotion — firstOrder", () => {
  it("passes when customer has no prior orders", () => {
    const cart = { ...baseCart(), customer_id: "cust_1", firstOrder: true }
    expect(
      evaluatePromotion(
        config([includeGroup([{ rule_type: "comparison", config: { field: "firstOrder", operator: "eq", value: true } }])]),
        cart
      )
    ).toBe(true)
  })

  it("fails when customer already has orders", () => {
    const cart = { ...baseCart(), customer_id: "cust_1", firstOrder: false }
    expect(
      evaluatePromotion(
        config([includeGroup([{ rule_type: "comparison", config: { field: "firstOrder", operator: "eq", value: true } }])]),
        cart
      )
    ).toBe(false)
  })

  it("passes for guest cart (no customer) — optimistic", () => {
    const cart = { ...baseCart() }
    expect(
      evaluatePromotion(
        config([includeGroup([{ rule_type: "comparison", config: { field: "firstOrder", operator: "eq", value: true } }])]),
        cart
      )
    ).toBe(true)
  })
})

// ─── OR between groups ────────────────────────────────────────────────────────

describe("evaluatePromotion — OR between include groups", () => {
  it("passes when second group matches even if first does not", () => {
    const cart = { ...baseCart(), subtotal: 100, totalQuantity: 5}
    expect(
      evaluatePromotion(
        config([
          includeGroup([{ rule_type: "comparison", config: { field: "subtotal", operator: "gte", value: 200 } }]),
          includeGroup([{ rule_type: "comparison", config: { field: "totalQuantity", operator: "gte", value: 3 } }]),
        ]),
        cart
      )
    ).toBe(true)
  })

  it("fails when no include group passes", () => {
    const cart = { ...baseCart(), subtotal: 50, totalQuantity: 1}
    expect(
      evaluatePromotion(
        config([
          includeGroup([{ rule_type: "comparison", config: { field: "subtotal", operator: "gte", value: 200 } }]),
          includeGroup([{ rule_type: "comparison", config: { field: "totalQuantity", operator: "gte", value: 3 } }]),
        ]),
        cart
      )
    ).toBe(false)
  })
})

// ─── exclude groups (AND-NOT) ─────────────────────────────────────────────────

describe("evaluatePromotion — exclude groups", () => {
  it("suppresses when exclude group passes even if include passes", () => {
    const cart = { ...baseCart(), subtotal: 300, customer_id: "cust_1", firstOrder: true }
    expect(
      evaluatePromotion(
        config([
          includeGroup([{ rule_type: "comparison", config: { field: "subtotal", operator: "gte", value: 300 } }]),
          excludeGroup([{ rule_type: "comparison", config: { field: "firstOrder", operator: "eq", value: true } }]),
        ]),
        cart
      )
    ).toBe(false)
  })

  it("allows when include passes and exclude does not", () => {
    const cart = { ...baseCart(), subtotal: 300, customer_id: "cust_1", firstOrder: false }
    expect(
      evaluatePromotion(
        config([
          includeGroup([{ rule_type: "comparison", config: { field: "subtotal", operator: "gte", value: 300 } }]),
          excludeGroup([{ rule_type: "comparison", config: { field: "firstOrder", operator: "eq", value: true } }]),
        ]),
        cart
      )
    ).toBe(true) // firstOrder eq true fails → exclude doesn't suppress → promotion eligible
  })

  it("allows when include passes and exclude rules fail", () => {
    const cart = { ...baseCart(), subtotal: 400, customer_id: "cust_2", firstOrder: false }
    expect(
      evaluatePromotion(
        config([
          includeGroup([{ rule_type: "comparison", config: { field: "subtotal", operator: "gte", value: 300 } }]),
          excludeGroup([{ rule_type: "comparison", config: { field: "firstOrder", operator: "eq", value: true } }]),
        ]),
        cart
      )
    ).toBe(true)
  })
})

// ─── unknown rule_type ────────────────────────────────────────────────────────

describe("evaluatePromotion — unknown rule_type", () => {
  it("throws when rule_type is not registered", () => {
    const cart = baseCart()
    expect(() =>
      evaluatePromotion(
        config([includeGroup([{ rule_type: "bundle" as any, config: {} as any }])]),
        cart
      )
    ).toThrow(/unknown rule type/i)
  })
})

// ─── rules_combinator ─────────────────────────────────────────────────────────

describe("evaluatePromotion — rules_combinator", () => {
  it("passes with OR combinator when only one of two rules matches", () => {
    const cart = { ...baseCart(), subtotal: 100, totalQuantity: 1 }
    expect(
      evaluatePromotion(
        config([
          includeGroup(
            [
              { rule_type: "comparison", config: { field: "subtotal", operator: "gte", value: 200 } },
              { rule_type: "comparison", config: { field: "totalQuantity", operator: "gte", value: 1 } },
            ],
            "or"
          ),
        ]),
        cart
      )
    ).toBe(true)
  })

  it("fails with AND combinator when one of two rules does not match", () => {
    const cart = { ...baseCart(), subtotal: 100, totalQuantity: 1 }
    expect(
      evaluatePromotion(
        config([
          includeGroup(
            [
              { rule_type: "comparison", config: { field: "subtotal", operator: "gte", value: 200 } },
              { rule_type: "comparison", config: { field: "totalQuantity", operator: "gte", value: 1 } },
            ],
            "and"
          ),
        ]),
        cart
      )
    ).toBe(false)
  })
})

// ─── include_groups_combinator ────────────────────────────────────────────────

describe("evaluatePromotion — include_groups_combinator", () => {
  it("passes with OR combinator (default) when only second group matches", () => {
    const cart = { ...baseCart(), subtotal: 50, totalQuantity: 5 }
    expect(
      evaluatePromotion(
        config(
          [
            includeGroup([{ rule_type: "comparison", config: { field: "subtotal", operator: "gte", value: 200 } }]),
            includeGroup([{ rule_type: "comparison", config: { field: "totalQuantity", operator: "gte", value: 3 } }]),
          ],
          "or"
        ),
        cart
      )
    ).toBe(true)
  })

  it("fails with AND combinator when only one of two groups matches", () => {
    const cart = { ...baseCart(), subtotal: 50, totalQuantity: 5 }
    expect(
      evaluatePromotion(
        config(
          [
            includeGroup([{ rule_type: "comparison", config: { field: "subtotal", operator: "gte", value: 200 } }]),
            includeGroup([{ rule_type: "comparison", config: { field: "totalQuantity", operator: "gte", value: 3 } }]),
          ],
          "and"
        ),
        cart
      )
    ).toBe(false)
  })

  it("passes with AND combinator when both groups match", () => {
    const cart = { ...baseCart(), subtotal: 300, totalQuantity: 5 }
    expect(
      evaluatePromotion(
        config(
          [
            includeGroup([{ rule_type: "comparison", config: { field: "subtotal", operator: "gte", value: 200 } }]),
            includeGroup([{ rule_type: "comparison", config: { field: "totalQuantity", operator: "gte", value: 3 } }]),
          ],
          "and"
        ),
        cart
      )
    ).toBe(true)
  })
})
