import {
  BaseFilterable,
  FindParams,
  OperatorMap,
} from "@medusajs/framework/types"

export interface AdminGetCartExtAdjustmentParams
  extends FindParams,
    BaseFilterable<AdminGetCartExtAdjustmentParams> {
  id?: string | string[]
  cart_id?: string | string[]
  source?: string | string[]
  item_id?: string | string[]
  promotion_id?: string | string[]
  created_at?: OperatorMap<string>
  updated_at?: OperatorMap<string>
}
