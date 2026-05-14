import { useMutation, useQueryClient } from "@tanstack/react-query"
import { sdk } from "../../lib/sdk"
import { PromotionExtRuleGroup } from "../../lib/types"
import { PROMOTION_EXT_RULE_GROUPS_QUERY_KEY } from "./use-promotion-ext-rule-groups"

type CreatePayload = {
  promotion_config_id: string
  type: "include" | "exclude"
}

type CreateResponse = {
  promotion_ext_rule_group: PromotionExtRuleGroup
}

export const useCreatePromotionExtRuleGroup = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: CreatePayload) =>
      sdk.client.fetch<CreateResponse>("/admin/promotion-ext-rule-groups", {
        method: "POST",
        body: payload,
      }),
    onSuccess: (_data, { promotion_config_id }) => {
      queryClient.invalidateQueries({
        queryKey: [PROMOTION_EXT_RULE_GROUPS_QUERY_KEY, promotion_config_id],
      })
    },
  })
}
