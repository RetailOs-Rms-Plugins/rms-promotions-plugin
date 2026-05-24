export interface EligibleItem {
  id: string
  unit_price: number
  quantity: number
}

export interface AdjustmentResult {
  item_id: string
  amount: number
}

export interface PromotionAdjustmentGroup {
  promotion_id: string
  adjustments: AdjustmentResult[]
}

export interface BundleModeConfig {
  bundle_size: number
  bundle_price: number
  remainder: "full_price"
}

export interface BuyGetRepeatModeConfig {
  buy_quantity: number
  get_quantity: number
  discount_type: "percentage" | "fixed"
  discount_value: number
  discount_target: "cheapest"
  remainder: "full_price"
}

export function computeBundle(
  promotionId: string,
  items: EligibleItem[],
  config: BundleModeConfig
): PromotionAdjustmentGroup {
  const expandedItems: { item_id: string; unit_price: number }[] = []
  for (const item of items) {
    for (let i = 0; i < item.quantity; i++) {
      expandedItems.push({ item_id: item.id, unit_price: item.unit_price })
    }
  }

  const totalQty = expandedItems.length
  const completeBundles = Math.floor(totalQty / config.bundle_size)

  if (completeBundles === 0) {
    return { promotion_id: promotionId, adjustments: [] }
  }

  const bundledCount = completeBundles * config.bundle_size
  const originalTotal = expandedItems.slice(0, bundledCount).reduce((sum, i) => sum + i.unit_price, 0)
  const bundleTotal = completeBundles * config.bundle_price
  const totalSavings = originalTotal - bundleTotal

  if (totalSavings <= 0) {
    return { promotion_id: promotionId, adjustments: [] }
  }

  const adjustmentsByItem = new Map<string, number>()
  let distributed = 0

  const bundledItems = expandedItems.slice(0, bundledCount)
  for (let i = 0; i < bundledItems.length; i++) {
    const item = bundledItems[i]
    const isLast = i === bundledItems.length - 1
    const share = isLast
      ? totalSavings - distributed
      : Math.floor(totalSavings * (item.unit_price / originalTotal))

    adjustmentsByItem.set(item.item_id, (adjustmentsByItem.get(item.item_id) ?? 0) + share)
    distributed += share
  }

  const adjustments: AdjustmentResult[] = []
  for (const [item_id, amount] of adjustmentsByItem) {
    if (amount > 0) {
      adjustments.push({ item_id, amount })
    }
  }

  return { promotion_id: promotionId, adjustments }
}

export function computeBuyGetRepeat(
  promotionId: string,
  items: EligibleItem[],
  config: BuyGetRepeatModeConfig
): PromotionAdjustmentGroup {
  const expandedItems: { item_id: string; unit_price: number }[] = []
  for (const item of items) {
    for (let i = 0; i < item.quantity; i++) {
      expandedItems.push({ item_id: item.id, unit_price: item.unit_price })
    }
  }

  expandedItems.sort((a, b) => a.unit_price - b.unit_price)

  const groupSize = config.buy_quantity + config.get_quantity
  const completeGroups = Math.floor(expandedItems.length / groupSize)

  if (completeGroups === 0) {
    return { promotion_id: promotionId, adjustments: [] }
  }

  const adjustmentsByItem = new Map<string, number>()

  for (let g = 0; g < completeGroups; g++) {
    const groupStart = g * groupSize
    const groupItems = expandedItems.slice(groupStart, groupStart + groupSize)

    const discountedItems = groupItems.slice(0, config.get_quantity)

    for (const item of discountedItems) {
      let discount: number
      if (config.discount_type === "percentage") {
        discount = Math.floor(item.unit_price * (config.discount_value / 100))
      } else {
        discount = Math.min(config.discount_value, item.unit_price)
      }

      if (discount > 0) {
        adjustmentsByItem.set(item.item_id, (adjustmentsByItem.get(item.item_id) ?? 0) + discount)
      }
    }
  }

  const adjustments: AdjustmentResult[] = []
  for (const [item_id, amount] of adjustmentsByItem) {
    adjustments.push({ item_id, amount })
  }

  return { promotion_id: promotionId, adjustments }
}
