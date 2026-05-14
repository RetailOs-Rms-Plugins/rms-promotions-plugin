import { useMutation } from "@tanstack/react-query"
import { sdk } from "../../lib/sdk"
import { PromotionExtConfig } from "../../lib/types"

type UpdatePayload = {
  id: string
  promotion_id: string
  auto_apply: boolean
}

type UpdateResponse = {
  promotion_ext_config: PromotionExtConfig
}

export const useUpdatePromotionExtConfig = () => {
  return useMutation({
    mutationFn: ({ id, auto_apply }: UpdatePayload) =>
      sdk.client.fetch<UpdateResponse>(`/admin/promotion-ext-configs/${id}`, {
        method: "PATCH",
        body: { auto_apply },
      }),
  })
}
