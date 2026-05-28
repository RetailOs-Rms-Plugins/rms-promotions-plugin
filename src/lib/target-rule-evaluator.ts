export interface TargetRule {
  attribute: string
  operator: string
  values: string[]
}

export interface CartItemForTargetRules {
  id: string
  product_id: string
  product?: {
    collection_id?: string
    categories?: { id: string }[]
    type_id?: string
    tags?: { id: string }[]
  }
}

type AttributeExtractor = (item: CartItemForTargetRules) => string[]

const attributeExtractors: Record<string, AttributeExtractor> = {
  product: (item) => [item.product_id],
  product_collection: (item) => item.product?.collection_id ? [item.product.collection_id] : [],
  product_category: (item) => (item.product?.categories ?? []).map((c) => c.id),
  product_type: (item) => item.product?.type_id ? [item.product.type_id] : [],
  product_tag: (item) => (item.product?.tags ?? []).map((t) => t.id),
}

// Medusa stores target rule attributes as full paths (e.g. "items.product.id");
// normalize to the short keys used by attributeExtractors.
const medusaAttributeAliases: Record<string, string> = {
  "items.product.id": "product",
  "items.product.collection_id": "product_collection",
  "items.product.categories.id": "product_category",
  "items.product.type_id": "product_type",
  "items.product.tags.id": "product_tag",
}

function normalizeAttribute(attr: string): string {
  return medusaAttributeAliases[attr] ?? attr
}

function matchesRule(item: CartItemForTargetRules, rule: TargetRule): boolean {
  const extractor = attributeExtractors[normalizeAttribute(rule.attribute)]
  if (!extractor) {
    throw new Error(`Unknown target rule attribute: "${rule.attribute}". Supported: ${Object.keys(attributeExtractors).join(", ")} (also accepted as ${Object.keys(medusaAttributeAliases).join(", ")})`)
  }

  const itemValues = extractor(item)
  if (!itemValues.length) return false

  const ruleValues = new Set(rule.values)

  switch (rule.operator) {
    case "in":
    case "eq":
      return itemValues.some((v) => ruleValues.has(v))
    case "nin":
    case "ne":
      return itemValues.every((v) => !ruleValues.has(v))
    default:
      return itemValues.some((v) => ruleValues.has(v))
  }
}

export function filterEligibleItems(
  items: CartItemForTargetRules[],
  rules: TargetRule[]
): CartItemForTargetRules[] {
  if (!rules.length) return items

  return items.filter((item) => rules.every((rule) => matchesRule(item, rule)))
}
