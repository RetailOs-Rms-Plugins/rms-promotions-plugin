import { useMutation, useQueryClient } from "@tanstack/react-query"
import { sdk } from "../../lib/sdk"
import { PromotionExtRuleGroup } from "../../lib/types"
import { PROMOTION_EXT_RULE_GROUPS_QUERY_KEY } from "./use-promotion-ext-rule-groups"

type BatchCreateItem = { promotion_config_id: string; type: "include" | "exclude" }
type BatchGroupsResponse = { promotion_ext_rule_groups: PromotionExtRuleGroup[] }
type BatchDeleteResponse = { ids: string[]; deleted: boolean }

export const useBatchCreatePromotionExtRuleGroups = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: { items: BatchCreateItem[] }) =>
      sdk.client.fetch<BatchGroupsResponse>("/admin/promotion-ext-rule-groups/batch", {
        method: "POST",
        body: payload,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PROMOTION_EXT_RULE_GROUPS_QUERY_KEY] })
    },
  })
}

export const useBatchDeletePromotionExtRuleGroups = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: { ids: string[] }) =>
      sdk.client.fetch<BatchDeleteResponse>("/admin/promotion-ext-rule-groups/batch", {
        method: "DELETE",
        body: payload,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PROMOTION_EXT_RULE_GROUPS_QUERY_KEY] })
    },
  })
}
