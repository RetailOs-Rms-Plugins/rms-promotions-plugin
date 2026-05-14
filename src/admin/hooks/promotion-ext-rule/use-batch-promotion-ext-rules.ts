import { useMutation, useQueryClient } from "@tanstack/react-query"
import { sdk } from "../../lib/sdk"
import { PromotionExtRule, ComparisonRuleConfig } from "../../lib/types"
import { PROMOTION_EXT_RULES_QUERY_KEY } from "./use-promotion-ext-rules"

type BatchCreateItem = { rule_group_id: string; rule_type: "comparison"; config: ComparisonRuleConfig }
type BatchUpdateItem = { id: string; rule_type: "comparison"; config: ComparisonRuleConfig }
type BatchRulesResponse = { promotion_ext_rules: PromotionExtRule[] }
type BatchDeleteResponse = { ids: string[]; deleted: boolean }

export const useBatchCreatePromotionExtRules = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: { items: BatchCreateItem[] }) =>
      sdk.client.fetch<BatchRulesResponse>("/admin/promotion-ext-rules/batch", {
        method: "POST",
        body: payload,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PROMOTION_EXT_RULES_QUERY_KEY] })
    },
  })
}

export const useBatchUpdatePromotionExtRules = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: { items: BatchUpdateItem[] }) =>
      sdk.client.fetch<BatchRulesResponse>("/admin/promotion-ext-rules/batch", {
        method: "PATCH",
        body: payload,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PROMOTION_EXT_RULES_QUERY_KEY] })
    },
  })
}

export const useBatchDeletePromotionExtRules = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: { ids: string[] }) =>
      sdk.client.fetch<BatchDeleteResponse>("/admin/promotion-ext-rules/batch", {
        method: "DELETE",
        body: payload,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PROMOTION_EXT_RULES_QUERY_KEY] })
    },
  })
}
