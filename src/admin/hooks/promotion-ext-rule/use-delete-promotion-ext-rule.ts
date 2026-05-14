import { useMutation, useQueryClient } from "@tanstack/react-query"
import { sdk } from "../../lib/sdk"
import { PROMOTION_EXT_RULES_QUERY_KEY } from "./use-promotion-ext-rules"

export const useDeletePromotionExtRule = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) =>
      sdk.client.fetch(`/admin/promotion-ext-rules/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PROMOTION_EXT_RULES_QUERY_KEY] })
    },
  })
}
