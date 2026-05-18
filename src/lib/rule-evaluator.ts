export interface EnrichedCart {
  subtotal: number
  totalQuantity: number
  items: Array<{
    product_id: string
    totalQuantity: number
    product_collection_id?: string
  }>
  customer_id?: string
  usesPerCustomer?: number
  firstOrder?: boolean
}

export interface ComparisonRuleConfig {
  field:
    | "subtotal"
    | "totalQuantity"
    | "quantityOfProduct"
    | "quantityOfCollection"
    | "usesPerCustomer"
    | "firstOrder"
  operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte"
  value: number | boolean
  scope?: {
    product_id?: string
    collection_id?: string
  }
}

export interface RuleShape {
  rule_type: string
  config: ComparisonRuleConfig
}

export type Combinator = "and" | "or"

export interface RuleGroupShape {
  type: "include" | "exclude"
  rules_combinator: Combinator
  rules: RuleShape[]
}

export interface PromotionExtConfigShape {
  include_groups_combinator: Combinator
  exclude_groups_combinator: Combinator
  rule_groups: RuleGroupShape[]
}

function applyOperator(actual: number | boolean, operator: string, expected: number | boolean): boolean {
  switch (operator) {
    case "eq":  return actual === expected
    case "neq": return actual !== expected
    case "gt":  return (actual as number) > (expected as number)
    case "gte": return (actual as number) >= (expected as number)
    case "lt":  return (actual as number) < (expected as number)
    case "lte": return (actual as number) <= (expected as number)
    default:    throw new Error(`Unknown operator: ${operator}`)
  }
}

function evaluateComparisonRule(config: ComparisonRuleConfig, cart: EnrichedCart): boolean {
  const { field, operator, value, scope } = config

  if (field === "subtotal") {
    return applyOperator(cart.subtotal, operator, value)
  }

  if (field === "totalQuantity") {
    return applyOperator(cart.totalQuantity, operator, value)
  }

  if (field === "quantityOfProduct") {
    const productId = scope?.product_id
    const qty = cart.items
      .filter((i) => i.product_id === productId)
      .reduce((sum, i) => sum + i.totalQuantity, 0)
    return applyOperator(qty, operator, value)
  }

  if (field === "quantityOfCollection") {
    const collectionId = scope?.collection_id
    const qty = cart.items
      .filter((i) => i.product_collection_id === collectionId)
      .reduce((sum, i) => sum + i.totalQuantity, 0)
    return applyOperator(qty, operator, value)
  }

  if (field === "usesPerCustomer") {
    if (!cart.customer_id) return true // guest → optimistic pass
    return applyOperator(cart.usesPerCustomer ?? 0, operator, value)
  }

  if (field === "firstOrder") {
    if (!cart.customer_id) return true // guest → optimistic pass
    return applyOperator(cart.firstOrder ?? false, operator, value)
  }

  throw new Error(`Unknown comparison field: ${field}`)
}

const ruleEvaluators: Record<string, (config: unknown, cart: EnrichedCart) => boolean> = {
  comparison: (config, cart) => evaluateComparisonRule(config as ComparisonRuleConfig, cart),
}

function evaluateRule(rule: RuleShape, cart: EnrichedCart): boolean {
  const evaluator = ruleEvaluators[rule.rule_type]
  if (!evaluator) throw new Error(`Unknown rule type: ${rule.rule_type}`)
  return evaluator(rule.config, cart)
}

function combine(results: boolean[], combinator: Combinator): boolean {
  return combinator === "and" ? results.every(Boolean) : results.some(Boolean)
}

function evaluateGroup(group: RuleGroupShape, cart: EnrichedCart): boolean {
  return combine(group.rules.map((rule) => evaluateRule(rule, cart)), group.rules_combinator)
}

export function evaluatePromotion(config: PromotionExtConfigShape, cart: EnrichedCart): boolean {
  const includeGroups = config.rule_groups.filter((g) => g.type === "include")
  const excludeGroups = config.rule_groups.filter((g) => g.type === "exclude")

  const included =
    includeGroups.length === 0 ||
    combine(includeGroups.map((g) => evaluateGroup(g, cart)), config.include_groups_combinator)
  if (!included) return false

  const excluded =
    excludeGroups.length > 0 &&
    combine(excludeGroups.map((g) => evaluateGroup(g, cart)), config.exclude_groups_combinator)
  return !excluded
}
