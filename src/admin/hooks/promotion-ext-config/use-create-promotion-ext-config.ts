import { useMutation, useQueryClient } from "@tanstack/react-query"
import { sdk } from "../../lib/sdk"
import { PromotionExtConfig } from "../../lib/types"
import { PROMOTION_EXT_CONFIG_QUERY_KEY } from "./use-promotion-ext-config"

type CreatePayload = {
  promotion_id: string
  auto_apply?: boolean
}

type CreateResponse = {
  promotion_ext_config: PromotionExtConfig
}

export const useCreatePromotionExtConfig = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: CreatePayload) =>
      sdk.client.fetch<CreateResponse>("/admin/promotion-ext-configs", {
        method: "POST",
        body: { auto_apply: false, ...payload },
      }),
    onSuccess: (_data, { promotion_id }) => {
      queryClient.invalidateQueries({
        queryKey: [PROMOTION_EXT_CONFIG_QUERY_KEY, promotion_id],
      })
    },
  })
}
