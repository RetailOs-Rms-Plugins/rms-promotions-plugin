import { useQuery } from "@tanstack/react-query"
import { sdk } from "../../lib/sdk"
import { PromotionExtConfig } from "../../lib/types"

export const PROMOTION_EXT_CONFIG_QUERY_KEY = "promotion_ext_config"

type ConfigListResponse = {
  promotion_ext_configs: PromotionExtConfig[]
  count: number
}

export const usePromotionExtConfig = (promotionId: string | undefined) => {
  const { data, isLoading, error } = useQuery<ConfigListResponse>({
    queryKey: [PROMOTION_EXT_CONFIG_QUERY_KEY, promotionId],
    queryFn: () =>
      sdk.client.fetch(`/admin/promotion-ext-configs?promotion_id=${promotionId}`, {
        method: "GET",
      }),
    enabled: !!promotionId,
  })

  return {
    config: data?.promotion_ext_configs?.[0] ?? null,
    isLoading,
    error,
  }
}
