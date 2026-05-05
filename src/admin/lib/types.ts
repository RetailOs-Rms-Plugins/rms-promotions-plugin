export type ThresholdPromotion = {
  threshold_rule: {
    id: string
    min_cart_subtotal: number
  }
  promotion: {
    id: string
    code: string
    is_automatic: boolean
    status: string
    application_method: {
      type: "fixed" | "percentage"
      value: number
      currency_code: string
    } | null
    campaign_id: string | null
  }
}

export type ThresholdPromotionsResponse = {
  threshold_promotions: ThresholdPromotion[]
  count: number
  offset: number
  limit: number
}
