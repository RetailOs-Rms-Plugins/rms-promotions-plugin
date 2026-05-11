import {
  BaseFilterable,
  FindParams,
  OperatorMap,
} from "@medusajs/framework/types"

export interface AdminGetPromotionExtRuleGroupParams
  extends FindParams,
    BaseFilterable<AdminGetPromotionExtRuleGroupParams> {
  id?: string | string[]
  promotion_config_id?: string | string[]
  type?: string | string[]
  created_at?: OperatorMap<string>
  updated_at?: OperatorMap<string>
}
