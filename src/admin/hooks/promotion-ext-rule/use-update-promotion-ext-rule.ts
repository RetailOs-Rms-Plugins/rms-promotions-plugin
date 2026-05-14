import { useMutation, useQueryClient } from "@tanstack/react-query"
import { sdk } from "../../lib/sdk"
import { PromotionExtRule, ComparisonRuleConfig } from "../../lib/types"
import { PROMOTION_EXT_RULES_QUERY_KEY } from "./use-promotion-ext-rules"

type UpdatePayload = {
  id: string
  rule_type: "comparison"
  config: ComparisonRuleConfig
}

type UpdateResponse = {
  promotion_ext_rule: PromotionExtRule
}

export const useUpdatePromotionExtRule = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, ...body }: UpdatePayload) =>
      sdk.client.fetch<UpdateResponse>(`/admin/promotion-ext-rules/${id}`, {
        method: "PATCH",
        body,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PROMOTION_EXT_RULES_QUERY_KEY] })
    },
  })
}
