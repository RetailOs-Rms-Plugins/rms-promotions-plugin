import { filterEligibleItems, type TargetRule, type CartItemForTargetRules } from "../target-rule-evaluator"

const makeItem = (overrides: Partial<CartItemForTargetRules> & { id: string }): CartItemForTargetRules => ({
  product_id: "prod_default",
  product: {},
  ...overrides,
})

describe("filterEligibleItems", () => {
  it("filters by product attribute", () => {
    const items = [
      makeItem({ id: "item_1", product_id: "prod_a" }),
      makeItem({ id: "item_2", product_id: "prod_b" }),
      makeItem({ id: "item_3", product_id: "prod_a" }),
    ]
    const rules: TargetRule[] = [
      { attribute: "product", operator: "in", values: ["prod_a"] },
    ]

    const result = filterEligibleItems(items, rules)
    expect(result.map((i) => i.id)).toEqual(["item_1", "item_3"])
  })

  it("filters by product_collection attribute", () => {
    const items = [
      makeItem({ id: "item_1", product: { collection_id: "col_socks" } }),
      makeItem({ id: "item_2", product: { collection_id: "col_shirts" } }),
      makeItem({ id: "item_3", product: { collection_id: "col_socks" } }),
    ]
    const rules: TargetRule[] = [
      { attribute: "product_collection", operator: "in", values: ["col_socks"] },
    ]

    const result = filterEligibleItems(items, rules)
    expect(result.map((i) => i.id)).toEqual(["item_1", "item_3"])
  })

  it("filters by product_category attribute", () => {
    const items = [
      makeItem({ id: "item_1", product: { categories: [{ id: "cat_a" }] } }),
      makeItem({ id: "item_2", product: { categories: [{ id: "cat_b" }, { id: "cat_c" }] } }),
      makeItem({ id: "item_3", product: { categories: [{ id: "cat_c" }] } }),
    ]
    const rules: TargetRule[] = [
      { attribute: "product_category", operator: "in", values: ["cat_c"] },
    ]

    const result = filterEligibleItems(items, rules)
    expect(result.map((i) => i.id)).toEqual(["item_2", "item_3"])
  })

  it("filters by product_type attribute", () => {
    const items = [
      makeItem({ id: "item_1", product: { type_id: "type_shoes" } }),
      makeItem({ id: "item_2", product: { type_id: "type_hats" } }),
    ]
    const rules: TargetRule[] = [
      { attribute: "product_type", operator: "in", values: ["type_shoes"] },
    ]

    const result = filterEligibleItems(items, rules)
    expect(result.map((i) => i.id)).toEqual(["item_1"])
  })

  it("filters by product_tag attribute", () => {
    const items = [
      makeItem({ id: "item_1", product: { tags: [{ id: "tag_sale" }, { id: "tag_new" }] } }),
      makeItem({ id: "item_2", product: { tags: [{ id: "tag_clearance" }] } }),
      makeItem({ id: "item_3", product: { tags: [{ id: "tag_sale" }] } }),
    ]
    const rules: TargetRule[] = [
      { attribute: "product_tag", operator: "in", values: ["tag_sale"] },
    ]

    const result = filterEligibleItems(items, rules)
    expect(result.map((i) => i.id)).toEqual(["item_1", "item_3"])
  })

  it("AND-combines multiple rules — all must match", () => {
    const items = [
      makeItem({ id: "item_1", product_id: "prod_a", product: { collection_id: "col_socks" } }),
      makeItem({ id: "item_2", product_id: "prod_a", product: { collection_id: "col_shirts" } }),
      makeItem({ id: "item_3", product_id: "prod_b", product: { collection_id: "col_socks" } }),
    ]
    const rules: TargetRule[] = [
      { attribute: "product", operator: "in", values: ["prod_a"] },
      { attribute: "product_collection", operator: "in", values: ["col_socks"] },
    ]

    const result = filterEligibleItems(items, rules)
    expect(result.map((i) => i.id)).toEqual(["item_1"])
  })

  it("throws on unrecognized attribute", () => {
    const items = [makeItem({ id: "item_1" })]
    const rules: TargetRule[] = [
      { attribute: "unknown_attr", operator: "in", values: ["val"] },
    ]

    expect(() => filterEligibleItems(items, rules)).toThrow('Unknown target rule attribute: "unknown_attr"')
  })

  it("excludes items with missing product relations gracefully", () => {
    const items = [
      makeItem({ id: "item_1", product: { collection_id: "col_a" } }),
      makeItem({ id: "item_2", product: {} }),
      makeItem({ id: "item_3", product: undefined }),
    ]
    const rules: TargetRule[] = [
      { attribute: "product_collection", operator: "in", values: ["col_a"] },
    ]

    const result = filterEligibleItems(items, rules)
    expect(result.map((i) => i.id)).toEqual(["item_1"])
  })

  it("returns all items when rules array is empty", () => {
    const items = [
      makeItem({ id: "item_1" }),
      makeItem({ id: "item_2" }),
    ]

    const result = filterEligibleItems(items, [])
    expect(result).toHaveLength(2)
  })

  it("normalizes Medusa full-path attributes (e.g. items.product.id → product)", () => {
    const items = [
      makeItem({ id: "item_1", product_id: "prod_a" }),
      makeItem({ id: "item_2", product_id: "prod_b" }),
    ]
    const rules: TargetRule[] = [
      { attribute: "items.product.id", operator: "in", values: ["prod_a"] },
    ]

    const result = filterEligibleItems(items, rules)
    expect(result.map((i) => i.id)).toEqual(["item_1"])
  })

  it("normalizes all Medusa full-path attribute variants", () => {
    const items = [
      makeItem({
        id: "item_1",
        product_id: "prod_a",
        product: {
          collection_id: "col_x",
          categories: [{ id: "cat_y" }],
          type_id: "type_z",
          tags: [{ id: "tag_w" }],
        },
      }),
    ]

    expect(filterEligibleItems(items, [{ attribute: "items.product.id", operator: "in", values: ["prod_a"] }])).toHaveLength(1)
    expect(filterEligibleItems(items, [{ attribute: "items.product.collection_id", operator: "in", values: ["col_x"] }])).toHaveLength(1)
    expect(filterEligibleItems(items, [{ attribute: "items.product.categories.id", operator: "in", values: ["cat_y"] }])).toHaveLength(1)
    expect(filterEligibleItems(items, [{ attribute: "items.product.type_id", operator: "in", values: ["type_z"] }])).toHaveLength(1)
    expect(filterEligibleItems(items, [{ attribute: "items.product.tags.id", operator: "in", values: ["tag_w"] }])).toHaveLength(1)
  })

  it("supports nin operator to exclude matching items", () => {
    const items = [
      makeItem({ id: "item_1", product_id: "prod_a" }),
      makeItem({ id: "item_2", product_id: "prod_b" }),
      makeItem({ id: "item_3", product_id: "prod_c" }),
    ]
    const rules: TargetRule[] = [
      { attribute: "product", operator: "nin", values: ["prod_b"] },
    ]

    const result = filterEligibleItems(items, rules)
    expect(result.map((i) => i.id)).toEqual(["item_1", "item_3"])
  })
})
