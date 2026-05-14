import { useQuery } from "@tanstack/react-query"
import { sdk } from "../../lib/sdk"
import { PromotionExtRule } from "../../lib/types"

export const PROMOTION_EXT_RULES_QUERY_KEY = "promotion_ext_rules"

type RuleListResponse = {
  promotion_ext_rules: PromotionExtRule[]
  count: number
}

export const usePromotionExtRules = (groupIds: string[]) => {
  const queryString = groupIds.map((id) => `rule_group_id[]=${id}`).join("&")

  const { data, isLoading, error } = useQuery<RuleListResponse>({
    queryKey: [PROMOTION_EXT_RULES_QUERY_KEY, ...groupIds],
    queryFn: () =>
      sdk.client.fetch(`/admin/promotion-ext-rules?${queryString}`, {
        method: "GET",
      }),
    enabled: groupIds.length > 0,
  })

  return {
    rules: data?.promotion_ext_rules ?? [],
    isLoading,
    error,
  }
}
