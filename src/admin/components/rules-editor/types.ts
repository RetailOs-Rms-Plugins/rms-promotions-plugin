import type { ComparisonRuleConfig, Combinator, RuleField, RuleOperator } from "../../lib/types"

export type { ComparisonRuleConfig, Combinator, RuleField, RuleOperator }

export type RuleRow = {
  serverId: string | null
  rule_type: "comparison"
  config: ComparisonRuleConfig
}

export type GroupRow = {
  serverId: string | null
  type: "include" | "exclude"
  rules_combinator: Combinator
  rules: RuleRow[]
}

export type FormValues = {
  auto_apply: boolean
  include_groups_combinator: Combinator
  groups: GroupRow[]
}

export const defaultRuleRow = (): RuleRow => ({
  serverId: null,
  rule_type: "comparison",
  config: { field: "" as RuleField, operator: "" as RuleOperator, value: "" },
})
