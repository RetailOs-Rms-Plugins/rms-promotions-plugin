import {
  BaseFilterable,
  FindParams,
  OperatorMap,
} from "@medusajs/framework/types"

export interface AdminGetPromotionExtConfigParams
  extends FindParams,
    BaseFilterable<AdminGetPromotionExtConfigParams> {
  id?: string | string[]
  promotion_id?: string | string[]
  auto_apply?: boolean
  created_at?: OperatorMap<string>
  updated_at?: OperatorMap<string>
}
