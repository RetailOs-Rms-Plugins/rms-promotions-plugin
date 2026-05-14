import { useMutation, useQueryClient } from "@tanstack/react-query"
import { sdk } from "../../lib/sdk"
import { PROMOTION_EXT_RULE_GROUPS_QUERY_KEY } from "./use-promotion-ext-rule-groups"

type DeletePayload = {
  id: string
  promotion_config_id: string
}

export const useDeletePromotionExtRuleGroup = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id }: DeletePayload) =>
      sdk.client.fetch(`/admin/promotion-ext-rule-groups/${id}`, {
        method: "DELETE",
      }),
    onSuccess: (_data, { promotion_config_id }) => {
      queryClient.invalidateQueries({
        queryKey: [PROMOTION_EXT_RULE_GROUPS_QUERY_KEY, promotion_config_id],
      })
    },
  })
}
