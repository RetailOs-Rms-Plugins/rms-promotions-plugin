import { useMutation, useQueryClient } from "@tanstack/react-query"
import { sdk } from "../../lib/sdk"
import { PromotionExtRule, ComparisonRuleConfig } from "../../lib/types"
import { PROMOTION_EXT_RULES_QUERY_KEY } from "./use-promotion-ext-rules"

type CreatePayload = {
  rule_group_id: string
  rule_type: "comparison"
  config: ComparisonRuleConfig
}

type CreateResponse = {
  promotion_ext_rule: PromotionExtRule
}

export const useCreatePromotionExtRule = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: CreatePayload) =>
      sdk.client.fetch<CreateResponse>("/admin/promotion-ext-rules", {
        method: "POST",
        body: payload,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PROMOTION_EXT_RULES_QUERY_KEY] })
    },
  })
}
