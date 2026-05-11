import {
  BaseFilterable,
  FindParams,
  OperatorMap,
} from "@medusajs/framework/types"

export interface AdminGetPromotionExtRuleParams
  extends FindParams,
    BaseFilterable<AdminGetPromotionExtRuleParams> {
  id?: string | string[]
  rule_group_id?: string | string[]
  rule_type?: string | string[]
  created_at?: OperatorMap<string>
  updated_at?: OperatorMap<string>
}
