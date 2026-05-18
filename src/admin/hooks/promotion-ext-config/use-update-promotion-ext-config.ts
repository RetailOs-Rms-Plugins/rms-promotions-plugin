import { useMutation } from "@tanstack/react-query"
import { sdk } from "../../lib/sdk"
import { PromotionExtConfig } from "../../lib/types"

import { Combinator } from "../../lib/types"

type UpdatePayload = {
  id: string
  auto_apply: boolean
  include_groups_combinator: Combinator
}

type UpdateResponse = {
  promotion_ext_config: PromotionExtConfig
}

export const useUpdatePromotionExtConfig = () => {
  return useMutation({
    mutationFn: ({ id, auto_apply, include_groups_combinator }: UpdatePayload) =>
      sdk.client.fetch<UpdateResponse>(`/admin/promotion-ext-configs/${id}`, {
        method: "PATCH",
        body: { auto_apply, include_groups_combinator },
      }),
  })
}
