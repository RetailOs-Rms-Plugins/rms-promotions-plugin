import { useQuery } from "@tanstack/react-query"
import { sdk } from "../../lib/sdk"
import { PromotionExtRuleGroup } from "../../lib/types"

export const PROMOTION_EXT_RULE_GROUPS_QUERY_KEY = "promotion_ext_rule_groups"

type RuleGroupListResponse = {
  promotion_ext_rule_groups: PromotionExtRuleGroup[]
  count: number
}

export const usePromotionExtRuleGroups = (configId: string | undefined) => {
  const { data, isLoading, error } = useQuery<RuleGroupListResponse>({
    queryKey: [PROMOTION_EXT_RULE_GROUPS_QUERY_KEY, configId],
    queryFn: () =>
      sdk.client.fetch(
        `/admin/promotion-ext-rule-groups?promotion_config_id=${configId}`,
        { method: "GET" }
      ),
    enabled: !!configId,
  })

  return {
    ruleGroups: data?.promotion_ext_rule_groups ?? [],
    isLoading,
    error,
  }
}
