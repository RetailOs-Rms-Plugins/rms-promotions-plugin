import { useMutation } from "@tanstack/react-query"
import { sdk } from "../../lib/sdk"
import { Combinator, ModeConfig, PromotionExtConfig, PromotionMode } from "../../lib/types"

type UpdatePayload = {
  id: string
  auto_apply?: boolean
  include_groups_combinator?: Combinator
  promotion_mode?: PromotionMode
  mode_config?: ModeConfig
}

type UpdateResponse = {
  promotion_ext_config: PromotionExtConfig
}

export const useUpdatePromotionExtConfig = () => {
  return useMutation({
    mutationFn: ({ id, ...body }: UpdatePayload) =>
      sdk.client.fetch<UpdateResponse>(`/admin/promotion-ext-configs/${id}`, {
        method: "PATCH",
        body,
      }),
  })
}
