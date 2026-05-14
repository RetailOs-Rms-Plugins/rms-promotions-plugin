import { Badge, Text, Tooltip } from "@medusajs/ui"
import {
  ComparisonRuleConfig,
  PromotionExtConfig,
  PromotionExtRule,
  PromotionExtRuleGroup,
  RuleField,
  RuleOperator,
} from "../lib/types"

const FIELD_LABELS: Record<RuleField, string> = {
  subtotal: "Cart Subtotal",
  quantity: "Quantity",
  quantityOfProduct: "Product Quantity",
  quantityOfCollection: "Collection Quantity",
  usesPerCustomer: "Uses Per Customer",
  firstOrder: "First Order",
}

const OPERATOR_LABELS: Record<RuleOperator, string> = {
  eq: "Equals",
  neq: "Not Equal To",
  gt: "Greater Than",
  gte: "At Least",
  lt: "Less Than",
  lte: "At Most",
}

const MAX_VISIBLE_VALUES = 2

function ValueBadgeList({ values }: { values: string[] }) {
  const visible = values.slice(0, MAX_VISIBLE_VALUES)
  const overflow = values.slice(MAX_VISIBLE_VALUES)

  return (
    <div className="inline-flex gap-x-1">
      {visible.map((v) => (
        <Badge key={v} size="2xsmall">
          {v}
        </Badge>
      ))}
      {overflow.length > 0 && (
        <Tooltip
          content={
            <ul>
              {overflow.map((v) => (
                <li key={v}>{v}</li>
              ))}
            </ul>
          }
        >
          <Badge size="2xsmall" className="cursor-default whitespace-nowrap">
            +{overflow.length}
          </Badge>
        </Tooltip>
      )}
    </div>
  )
}

function RuleBlock({ rule }: { rule: PromotionExtRule }) {
  const cfg = rule.config as ComparisonRuleConfig
  const fieldLabel = FIELD_LABELS[cfg.field] ?? cfg.field
  const operatorLabel = OPERATOR_LABELS[cfg.operator] ?? cfg.operator
  const values = Array.isArray(cfg.value)
    ? cfg.value.map(String)
    : [String(cfg.value)]

  return (
    <div className="bg-ui-bg-subtle shadow-borders-base flex justify-around rounded-md p-2">
      <div className="text-ui-fg-subtle txt-compact-xsmall flex items-center whitespace-nowrap">
        <Badge
          size="2xsmall"
          className="txt-compact-xsmall-plus mx-1 inline-block truncate"
        >
          {fieldLabel}
        </Badge>
        <span className="txt-compact-2xsmall mx-1 inline-block">
          {operatorLabel}
        </span>
        <ValueBadgeList values={values} />
      </div>
    </div>
  )
}

function OrSeparator() {
  return (
    <div className="flex items-center gap-x-3 py-1">
      <div className="flex-1 h-px bg-ui-border-base" />
      <Text size="xsmall" className="text-ui-fg-muted shrink-0">
        OR
      </Text>
      <div className="flex-1 h-px bg-ui-border-base" />
    </div>
  )
}

function RuleGroupBlock({
  group,
  rules,
}: {
  group: PromotionExtRuleGroup
  rules: PromotionExtRule[]
}) {
  const groupRules = rules.filter((r) => r.rule_group_id === group.id)
  if (groupRules.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      {groupRules.map((rule) => (
        <RuleBlock key={rule.id} rule={rule} />
      ))}
    </div>
  )
}

function GroupSection({
  label,
  groups,
  rules,
}: {
  label: string
  groups: PromotionExtRuleGroup[]
  rules: PromotionExtRule[]
}) {
  const nonEmpty = groups.filter((g) =>
    rules.some((r) => r.rule_group_id === g.id)
  )
  if (nonEmpty.length === 0) return null

  return (
    <div className="space-y-2">
      <Text
        size="xsmall"
        weight="plus"
        className="text-ui-fg-subtle uppercase tracking-wider"
      >
        {label}
      </Text>
      <div className="flex flex-col gap-2">
        {nonEmpty.map((group, idx) => (
          <div key={group.id}>
            {idx > 0 && <OrSeparator />}
            <RuleGroupBlock group={group} rules={rules} />
          </div>
        ))}
      </div>
    </div>
  )
}

export function renderRulesDisplay(
  config: PromotionExtConfig | null,
  ruleGroups: PromotionExtRuleGroup[],
  rules: PromotionExtRule[]
) {
  if (!config) return null

  const includeGroups = ruleGroups.filter((g) => g.type === "include")
  const excludeGroups = ruleGroups.filter((g) => g.type === "exclude")

  const hasInclude = includeGroups.some((g) =>
    rules.some((r) => r.rule_group_id === g.id)
  )
  const hasExclude = excludeGroups.some((g) =>
    rules.some((r) => r.rule_group_id === g.id)
  )

  if (!hasInclude && !hasExclude) {
    return (
      <Text size="small" className="text-ui-fg-muted italic">
        No rules configured
      </Text>
    )
  }

  return (
    <div className="space-y-4">
      {hasInclude && (
        <GroupSection label="Apply When" groups={includeGroups} rules={rules} />
      )}
      {hasExclude && (
        <GroupSection
          label="Exclude When"
          groups={excludeGroups}
          rules={rules}
        />
      )}
    </div>
  )
}
