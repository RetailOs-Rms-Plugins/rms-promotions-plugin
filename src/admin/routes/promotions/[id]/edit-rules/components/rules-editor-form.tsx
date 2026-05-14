import { Fragment, useEffect, useRef, useState } from "react"
import { useForm, useFieldArray, Controller } from "react-hook-form"
import { useQueryClient } from "@tanstack/react-query"
import { Badge, Button, Switch, Label, Text, Skeleton, toast } from "@medusajs/ui"
import { ChevronDown } from "@medusajs/icons"
import { RouteFocusModal, useRouteModal, KeyboundForm } from "@retailos-ai/rms-medusa-ui"
import {
  usePromotionExtConfig,
  useCreatePromotionExtConfig,
  useUpdatePromotionExtConfig,
  PROMOTION_EXT_CONFIG_QUERY_KEY,
} from "../../../../../hooks/promotion-ext-config"
import {
  usePromotionExtRuleGroups,
  useBatchCreatePromotionExtRuleGroups,
  useBatchDeletePromotionExtRuleGroups,
} from "../../../../../hooks/promotion-ext-rule-group"
import {
  usePromotionExtRules,
  useBatchCreatePromotionExtRules,
  useBatchUpdatePromotionExtRules,
  useBatchDeletePromotionExtRules,
} from "../../../../../hooks/promotion-ext-rule"
import { RuleGroupCard } from "./rule-group-card"
import type { FormValues, GroupRow } from "../types"
import type { ComparisonRuleConfig } from "../../../../../lib/types"

type Props = { promotionId: string }

export const RulesEditorForm = ({ promotionId }: Props) => {
  const { handleSuccess } = useRouteModal()
  const queryClient = useQueryClient()

  const { config: configObj, isLoading: configLoading } = usePromotionExtConfig(promotionId)
  const { mutateAsync: createConfig, isPending: configCreating } = useCreatePromotionExtConfig()
  const { mutateAsync: updateConfig } = useUpdatePromotionExtConfig()

  const { ruleGroups, isLoading: groupsLoading } = usePromotionExtRuleGroups(configObj?.id)
  const { mutateAsync: batchCreateGroups } = useBatchCreatePromotionExtRuleGroups()
  const { mutateAsync: batchDeleteGroups } = useBatchDeletePromotionExtRuleGroups()

  const serverGroupIds = ruleGroups.map((g) => g.id)
  const { rules, isLoading: rulesLoading } = usePromotionExtRules(serverGroupIds)
  const { mutateAsync: batchCreateRules } = useBatchCreatePromotionExtRules()
  const { mutateAsync: batchUpdateRules } = useBatchUpdatePromotionExtRules()
  const { mutateAsync: batchDeleteRules } = useBatchDeletePromotionExtRules()

  const [excludeExpanded, setExcludeExpanded] = useState(false)

  const initialGroupsLoaded = useRef(false)
  const deletedGroupIds = useRef<string[]>([])
  const deletedRuleIds = useRef<string[]>([])

  const form = useForm<FormValues>({
    defaultValues: { auto_apply: false, groups: [] },
    mode: "onBlur",
  })

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "groups",
  })

  // Create config on first open if none exists
  useEffect(() => {
    if (configLoading) return
    if (configObj === null) {
      if (configCreating) return
      createConfig({ promotion_id: promotionId })
    } else {
      form.setValue("auto_apply", configObj.auto_apply)
    }
  }, [configLoading, configObj, configCreating])

  // Populate groups + rules once both finish loading
  useEffect(() => {
    if (groupsLoading || rulesLoading) return
    if (initialGroupsLoaded.current) return
    initialGroupsLoaded.current = true

    form.setValue(
      "groups",
      ruleGroups.map((g) => ({
        serverId: g.id,
        type: g.type,
        rules: rules
          .filter((r) => r.rule_group_id === g.id)
          .map((r) => ({
            serverId: r.id,
            rule_type: "comparison" as const,
            config: r.config,
          })),
      }))
    )
  }, [groupsLoading, rulesLoading, ruleGroups, rules])

  const handleRemoveGroup = (index: number) => {
    const group = fields[index] as typeof fields[number] & GroupRow
    if (group.serverId) deletedGroupIds.current.push(group.serverId)
    remove(index)
  }

  const onSubmit = form.handleSubmit(async ({ auto_apply, groups }) => {
    try {
      const configId = configObj!.id

      await updateConfig({ id: configId, promotion_id: promotionId, auto_apply })

      // Batch delete: removed groups + orphaned (now-empty) groups, and removed rules
      const groupsToDelete = [
        ...deletedGroupIds.current,
        ...groups.filter((g) => g.serverId && g.rules.length === 0).map((g) => g.serverId!),
      ]
      await Promise.all([
        groupsToDelete.length > 0 ? batchDeleteGroups({ ids: groupsToDelete }) : Promise.resolve(),
        deletedRuleIds.current.length > 0 ? batchDeleteRules({ ids: deletedRuleIds.current }) : Promise.resolve(),
      ])
      deletedGroupIds.current = []
      deletedRuleIds.current = []

      // Batch create new groups, then collect their server IDs
      const newGroups = groups.filter((g) => !g.serverId && g.rules.length > 0)
      const existingGroups = groups.filter((g) => g.serverId && g.rules.length > 0)

      let newGroupIds: string[] = []
      if (newGroups.length > 0) {
        const res = await batchCreateGroups({
          items: newGroups.map((g) => ({ promotion_config_id: configId, type: g.type })),
        })
        newGroupIds = res.promotion_ext_rule_groups.map((g) => g.id)
      }

      // Collect rules to create and update in one pass
      const rulesToCreate: { rule_group_id: string; rule_type: "comparison"; config: ComparisonRuleConfig }[] = []
      const rulesToUpdate: { id: string; rule_type: "comparison"; config: ComparisonRuleConfig }[] = []

      newGroups.forEach((group, i) => {
        group.rules.forEach((r) =>
          rulesToCreate.push({ rule_group_id: newGroupIds[i], rule_type: r.rule_type, config: r.config })
        )
      })

      existingGroups.forEach((group) => {
        group.rules.forEach((r) => {
          if (r.serverId) {
            rulesToUpdate.push({ id: r.serverId, rule_type: r.rule_type, config: r.config })
          } else {
            rulesToCreate.push({ rule_group_id: group.serverId!, rule_type: r.rule_type, config: r.config })
          }
        })
      })

      await Promise.all([
        rulesToCreate.length > 0 ? batchCreateRules({ items: rulesToCreate }) : Promise.resolve(),
        rulesToUpdate.length > 0 ? batchUpdateRules({ items: rulesToUpdate }) : Promise.resolve(),
      ])

      await queryClient.invalidateQueries({ queryKey: [PROMOTION_EXT_CONFIG_QUERY_KEY, promotionId] })
      toast.success("Saved")
      handleSuccess()
    } catch {
      toast.error("Failed to save")
    }
  })

  const isLoading = configLoading || groupsLoading || rulesLoading
  const includeFields = fields.filter((f) => (f as typeof f & GroupRow).type === "include")
  const excludeFields = fields.filter((f) => (f as typeof f & GroupRow).type === "exclude")

  return (
    <RouteFocusModal.Form form={form}>
      <KeyboundForm onSubmit={onSubmit} className="flex flex-1 flex-col min-h-0">
        <RouteFocusModal.Header>Promotion Rules Config</RouteFocusModal.Header>

        <RouteFocusModal.Body className="flex flex-col gap-y-6 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex flex-col gap-y-4 max-w-2xl">
              <Skeleton className="h-16 w-full rounded-lg" />
              <Skeleton className="h-8 w-1/3 rounded" />
              <Skeleton className="h-24 w-full rounded-lg" />
              <Skeleton className="h-8 w-1/4 rounded" />
            </div>
          ) : (
          <>
          <div className="flex flex-col gap-y-2 border rounded-lg p-4">
            <div className="flex items-center gap-x-3">
              <Controller
                control={form.control}
                name="auto_apply"
                render={({ field }) => (
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    id="auto-apply"
                    disabled={isLoading || !configObj}
                  />
                )}
              />
              <Label htmlFor="auto-apply" size="base" weight="plus">
                Auto-apply
              </Label>
            </div>
            <Text size="small" className="text-ui-fg-subtle">
              ON: applied automatically when rules pass. OFF: requires promo code.
            </Text>
          </div>

          {/* Include groups */}
          <div className="flex flex-col gap-y-3 max-w-2xl">
            <Text size="small" weight="plus" className="text-ui-fg-subtle uppercase tracking-wide">
              Apply when (include conditions)
            </Text>

            <div className="flex flex-col">
              {includeFields.map((field, i) => {
                const globalIndex = fields.findIndex((f) => f.id === field.id)
                return (
                  <Fragment key={field.id}>
                    {i > 0 && (
                      <div className="relative flex justify-center py-3">
                        <div className="absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2 bg-[linear-gradient(var(--border-strong)_33%,rgba(255,255,255,0)_0%)] bg-[length:1px_3px] bg-repeat-y" />
                        <Badge size="2xsmall" className="relative z-10">OR</Badge>
                      </div>
                    )}
                    <RuleGroupCard
                      groupIndex={globalIndex}
                      groupType="include"
                      groupNumber={i + 1}
                      control={form.control}
                      setValue={form.setValue}
                      onRemoveGroup={() => handleRemoveGroup(globalIndex)}
                      onRuleDeleted={(ruleServerId) => deletedRuleIds.current.push(ruleServerId)}
                    />
                  </Fragment>
                )
              })}
            </div>

            <Button
              variant="secondary"
              size="small"
              type="button"
              disabled={isLoading || !configObj}
              onClick={() => append({ serverId: null, type: "include", rules: [] })}
            >
              Add rule group
            </Button>
          </div>

          {/* Exclude groups */}
          <div className="flex flex-col gap-y-3 max-w-2xl">
            <button
              type="button"
              className="flex items-center gap-x-2 text-left"
              onClick={() => setExcludeExpanded((v) => !v)}
            >
              <Text size="small" weight="plus" className="text-ui-fg-subtle uppercase tracking-wide">
                Exclude when (AND NOT conditions)
              </Text>
              <ChevronDown
                className={`text-ui-fg-subtle transition-transform ${excludeExpanded ? "rotate-180" : ""}`}
              />
            </button>

            {excludeExpanded && (
              <>
                <div className="flex flex-col">
                  {excludeFields.map((field, i) => {
                    const globalIndex = fields.findIndex((f) => f.id === field.id)
                    return (
                      <Fragment key={field.id}>
                        {i > 0 && (
                          <div className="relative flex justify-center py-3">
                            <div className="absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2 bg-[linear-gradient(var(--border-strong)_33%,rgba(255,255,255,0)_0%)] bg-[length:1px_3px] bg-repeat-y" />
                            <Badge size="2xsmall" className="relative z-10">OR</Badge>
                          </div>
                        )}
                        <RuleGroupCard
                          groupIndex={globalIndex}
                          groupType="exclude"
                          groupNumber={i + 1}
                          control={form.control}
                          setValue={form.setValue}
                          onRemoveGroup={() => handleRemoveGroup(globalIndex)}
                          onRuleDeleted={(ruleServerId) => deletedRuleIds.current.push(ruleServerId)}
                        />
                      </Fragment>
                    )
                  })}
                </div>

                <Button
                  variant="secondary"
                  size="small"
                  type="button"
                  disabled={isLoading || !configObj}
                  onClick={() => append({ serverId: null, type: "exclude", rules: [] })}
                >
                  Add exclusion group
                </Button>
              </>
            )}
          </div>
          </>
          )}
        </RouteFocusModal.Body>

        <RouteFocusModal.Footer>
          <RouteFocusModal.Close asChild>
            <Button variant="secondary" type="button" disabled={form.formState.isSubmitting}>
              Cancel
            </Button>
          </RouteFocusModal.Close>
          <Button type="submit" isLoading={form.formState.isSubmitting} disabled={!configObj}>
            Save
          </Button>
        </RouteFocusModal.Footer>
      </KeyboundForm>
    </RouteFocusModal.Form>
  )
}
