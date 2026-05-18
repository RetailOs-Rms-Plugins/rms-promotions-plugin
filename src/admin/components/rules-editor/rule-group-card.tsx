import { useState } from "react"
import { useFieldArray, Controller, Control, UseFormSetValue, useWatch } from "react-hook-form"
import { Badge, Button, IconButton, Input, Select, Text } from "@medusajs/ui"
import { Trash, XMarkMini, ChevronDown } from "@medusajs/icons"
import { Fragment } from "react"
import type { FormValues, RuleRow, RuleField, RuleOperator, ComparisonRuleConfig } from "./types"
import { defaultRuleRow } from "./types"
import { CombinatorToggle } from "./combinator-toggle"

const FIELD_OPTIONS: { value: RuleField; label: string }[] = [
  { value: "subtotal", label: "Cart Subtotal" },
  { value: "totalQuantity", label: "Total Quantity" },
  { value: "quantityOfProduct", label: "Product Quantity" },
  { value: "quantityOfCollection", label: "Collection Quantity" },
  { value: "usesPerCustomer", label: "Uses Per Customer" },
  { value: "firstOrder", label: "First Order" },
]

const NUMERIC_OPERATORS: { value: RuleOperator; label: string }[] = [
  { value: "eq", label: "Equals" },
  { value: "neq", label: "Not Equal" },
  { value: "gt", label: "Greater Than" },
  { value: "gte", label: "At Least" },
  { value: "lt", label: "Less Than" },
  { value: "lte", label: "At Most" },
]

function getOperatorsForField(field: RuleField): { value: RuleOperator; label: string }[] {
  if (field === "usesPerCustomer") return [{ value: "lt", label: "Less Than" }, { value: "lte", label: "At Most" }]
  if (field === "firstOrder") return [{ value: "eq", label: "Equals" }]
  return NUMERIC_OPERATORS
}

function getDefaultsForField(field: RuleField): Pick<ComparisonRuleConfig, "operator" | "value" | "scope"> {
  if (field === "usesPerCustomer") return { operator: "lte", value: 0, scope: undefined }
  if (field === "firstOrder") return { operator: "eq", value: true, scope: undefined }
  return { operator: "gte", value: 0, scope: undefined }
}

type RuleRowProps = {
  groupIndex: number
  ruleIndex: number
  control: Control<FormValues>
  setValue: UseFormSetValue<FormValues>
  onRemove: () => void
}

const RuleRowFields = ({ groupIndex, ruleIndex, control, setValue, onRemove }: RuleRowProps) => {
  const fieldValue = useWatch({
    control,
    name: `groups.${groupIndex}.rules.${ruleIndex}.config.field`,
  })

  const operators = getOperatorsForField(fieldValue)

  const handleFieldChange = (newField: RuleField, onChange: (v: RuleField) => void) => {
    onChange(newField)
    const defaults = getDefaultsForField(newField)
    setValue(`groups.${groupIndex}.rules.${ruleIndex}.config.operator`, defaults.operator)
    setValue(`groups.${groupIndex}.rules.${ruleIndex}.config.value`, defaults.value)
    setValue(`groups.${groupIndex}.rules.${ruleIndex}.config.scope`, defaults.scope)
  }

  return (
    <div className="bg-ui-bg-subtle border-ui-border-base flex flex-row gap-2 rounded-xl border px-2 py-2">
      <div className="grow">
        <Controller
          control={control}
          name={`groups.${groupIndex}.rules.${ruleIndex}.config.field`}
          rules={{ required: "Select an attribute" }}
          render={({ field: f, fieldState }) => (
            <div className="mb-2">
              <Select value={f.value} onValueChange={(v) => handleFieldChange(v as RuleField, f.onChange)}>
                <Select.Trigger className="bg-ui-bg-base w-full">
                  <Select.Value placeholder="Select attribute" />
                </Select.Trigger>
                <Select.Content>
                  {FIELD_OPTIONS.map((opt) => (
                    <Select.Item key={opt.value} value={opt.value}>
                      <span className="text-ui-fg-subtle">{opt.label}</span>
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select>
              {fieldState.error && (
                <Text size="xsmall" className="text-ui-fg-error mt-1">{fieldState.error.message}</Text>
              )}
            </div>
          )}
        />

        <div className="flex gap-2">
          <Controller
            control={control}
            name={`groups.${groupIndex}.rules.${ruleIndex}.config.operator`}
            rules={{ required: "Select an operator" }}
            render={({ field: f, fieldState }) => (
              <div className="flex-1">
                <Select value={f.value} onValueChange={(v) => f.onChange(v as RuleOperator)}>
                  <Select.Trigger className="bg-ui-bg-base w-full">
                    <Select.Value placeholder="Select operator" />
                  </Select.Trigger>
                  <Select.Content>
                    {operators.map((op) => (
                      <Select.Item key={op.value} value={op.value}>
                        <span className="text-ui-fg-subtle">{op.label}</span>
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select>
                {fieldState.error && (
                  <Text size="xsmall" className="text-ui-fg-error mt-1">{fieldState.error.message}</Text>
                )}
              </div>
            )}
          />

          <Controller
            control={control}
            name={`groups.${groupIndex}.rules.${ruleIndex}.config.value`}
            rules={{
              validate: (v) => {
                if (fieldValue === "firstOrder") return true
                if (typeof v === "number") return !isNaN(v) || "Enter a valid number"
                return v !== "" || "Enter a value"
              },
            }}
            render={({ field: f, fieldState }) => {
              if (fieldValue === "firstOrder") {
                return (
                  <div className="flex-1">
                    <Select value={String(f.value)} onValueChange={(v) => f.onChange(v === "true")}>
                      <Select.Trigger className="bg-ui-bg-base w-full">
                        <Select.Value placeholder="Select value" />
                      </Select.Trigger>
                      <Select.Content>
                        <Select.Item value="true">True</Select.Item>
                        <Select.Item value="false">False</Select.Item>
                      </Select.Content>
                    </Select>
                  </div>
                )
              }
              return (
                <div className="flex-1">
                  <Input
                    type="number"
                    value={f.value as number}
                    onChange={(e) => f.onChange(Number(e.target.value))}
                  />
                  {fieldState.error && (
                    <Text size="xsmall" className="text-ui-fg-error mt-1">{fieldState.error.message}</Text>
                  )}
                </div>
              )
            }}
          />
        </div>

        {(fieldValue === "quantityOfProduct" || fieldValue === "quantityOfCollection") && (
          <div className="mt-2">
            <Controller
              control={control}
              name={`groups.${groupIndex}.rules.${ruleIndex}.config.scope`}
              rules={{
                validate: (v) => {
                  const scope = v as ComparisonRuleConfig["scope"] | undefined
                  if (fieldValue === "quantityOfProduct")
                    return !!scope?.product_id || "Enter a product ID"
                  if (fieldValue === "quantityOfCollection")
                    return !!scope?.collection_id || "Enter a collection ID"
                  return true
                },
              }}
              render={({ field: f, fieldState }) => {
                const scope = f.value as ComparisonRuleConfig["scope"] | undefined
                if (fieldValue === "quantityOfProduct") {
                  return (
                    <>
                      <Input
                        className="w-full"
                        placeholder="Product ID"
                        value={scope?.product_id ?? ""}
                        onChange={(e) => f.onChange({ ...scope, product_id: e.target.value })}
                      />
                      {fieldState.error && (
                        <Text size="xsmall" className="text-ui-fg-error mt-1">{fieldState.error.message}</Text>
                      )}
                    </>
                  )
                }
                return (
                  <>
                    <Input
                      className="w-full"
                      placeholder="Collection ID"
                      value={scope?.collection_id ?? ""}
                      onChange={(e) => f.onChange({ ...scope, collection_id: e.target.value })}
                    />
                    {fieldState.error && (
                      <Text size="xsmall" className="text-ui-fg-error mt-1">{fieldState.error.message}</Text>
                    )}
                  </>
                )
              }}
            />
          </div>
        )}
      </div>

      <div className="size-7 flex-none self-center">
        <IconButton size="small" variant="transparent" className="text-ui-fg-muted" type="button" onClick={onRemove}>
          <XMarkMini />
        </IconButton>
      </div>
    </div>
  )
}

type RuleGroupCardProps = {
  groupIndex: number
  groupType: "include" | "exclude"
  groupNumber: number
  control: Control<FormValues>
  setValue: UseFormSetValue<FormValues>
  onRemoveGroup: () => void
  onRuleDeleted: (ruleServerId: string) => void
}

export const RuleGroupCard = ({
  groupIndex,
  groupType,
  groupNumber,
  control,
  setValue,
  onRemoveGroup,
  onRuleDeleted,
}: RuleGroupCardProps) => {
  const [expanded, setExpanded] = useState(true)

  const rulesCombinator = useWatch({ control, name: `groups.${groupIndex}.rules_combinator` })

  const { fields, append, remove } = useFieldArray({
    control,
    name: `groups.${groupIndex}.rules`,
  })

  const handleRemoveRule = (index: number) => {
    const rule = fields[index] as typeof fields[number] & RuleRow
    if (rule.serverId) onRuleDeleted(rule.serverId)
    remove(index)
  }

  const title = `${groupType === "include" ? "Rule" : "Exclusion"} Group ${groupNumber}`

  return (
    <div className="border-ui-border-base rounded-lg border flex flex-col gap-y-0 overflow-hidden">
      <div
        className="flex items-center justify-between px-4 py-3 w-full hover:bg-ui-bg-subtle-hover transition-colors cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-x-2">
          <Text size="small" weight="plus">{title}</Text>
          {fields.length > 0 && (
            <Badge size="2xsmall">{fields.length} {fields.length === 1 ? "rule" : "rules"}</Badge>
          )}
        </div>
        <div className="flex items-center gap-x-2">
          <div onClick={(e) => e.stopPropagation()}>
            <Controller
              control={control}
              name={`groups.${groupIndex}.rules_combinator`}
              render={({ field: f }) => (
                <CombinatorToggle value={f.value} onChange={f.onChange} />
              )}
            />
          </div>
          <ChevronDown
            className={`text-ui-fg-subtle transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
          />
          <IconButton
            variant="transparent"
            type="button"
            onClick={(e) => { e.stopPropagation(); onRemoveGroup() }}
          >
            <Trash className="text-ui-fg-subtle" />
          </IconButton>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 flex flex-col gap-y-0">
          {fields.map((field, ruleIndex) => (
            <Fragment key={field.id}>
              <RuleRowFields
                groupIndex={groupIndex}
                ruleIndex={ruleIndex}
                control={control}
                setValue={setValue}
                onRemove={() => handleRemoveRule(ruleIndex)}
              />

              {ruleIndex < fields.length - 1 && (
                <div className="relative px-6 py-3">
                  <div className="border-ui-border-strong absolute bottom-0 left-[40px] top-0 z-[-1] w-px bg-[linear-gradient(var(--border-strong)_33%,rgba(255,255,255,0)_0%)] bg-[length:1px_3px] bg-repeat-y" />
                  <Badge size="2xsmall">{(rulesCombinator ?? "and").toUpperCase()}</Badge>
                </div>
              )}
            </Fragment>
          ))}

          <Button
            variant="secondary"
            size="small"
            type="button"
            className={`self-start ${fields.length > 0 ? "mt-4" : ""}`}
            onClick={() => append(defaultRuleRow())}
          >
            Add rule
          </Button>
        </div>
      )}
    </div>
  )
}
