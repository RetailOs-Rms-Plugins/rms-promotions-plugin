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
  remainder: "full_price"
}

export interface BundleApplicationMethod {
  value: number
  max_quantity?: number | null
}

export interface BuyGetRepeatModeConfig {
  buy_quantity: number
  get_quantity: number
  discount_target: "cheapest"
  remainder: "full_price"
}

export interface BuyGetRepeatApplicationMethod {
  type: "percentage" | "fixed"
  value: number
  max_quantity?: number | null
}

export function computeBundle(
  promotionId: string,
  items: EligibleItem[],
  config: BundleModeConfig,
  applicationMethod: BundleApplicationMethod
): PromotionAdjustmentGroup {
  const bundlePrice = applicationMethod.value

  const expandedItems: { item_id: string; unit_price: number }[] = []
  for (const item of items) {
    for (let i = 0; i < item.quantity; i++) {
      expandedItems.push({ item_id: item.id, unit_price: item.unit_price })
    }
  }

  const totalQty = expandedItems.length
  let completeBundles = Math.floor(totalQty / config.bundle_size)

  if (applicationMethod.max_quantity != null && applicationMethod.max_quantity > 0) {
    const maxBundlesFromItems = Math.floor(applicationMethod.max_quantity / config.bundle_size)
    completeBundles = Math.min(completeBundles, maxBundlesFromItems)
  }

  if (completeBundles === 0) {
    return { promotion_id: promotionId, adjustments: [] }
  }

  const adjustmentsByItem = new Map<string, number>()

  for (let b = 0; b < completeBundles; b++) {
    const groupStart = b * config.bundle_size
    const groupItems = expandedItems.slice(groupStart, groupStart + config.bundle_size)

    const groupOriginal = groupItems.reduce((sum, i) => sum + i.unit_price, 0)
    const groupSavings = groupOriginal - bundlePrice

    if (groupSavings <= 0) continue

    let distributed = 0
    for (let i = 0; i < groupItems.length; i++) {
      const item = groupItems[i]
      const isLast = i === groupItems.length - 1
      const share = isLast
        ? groupSavings - distributed
        : Math.floor(groupSavings * (item.unit_price / groupOriginal))

      adjustmentsByItem.set(item.item_id, (adjustmentsByItem.get(item.item_id) ?? 0) + share)
      distributed += share
    }
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
  config: BuyGetRepeatModeConfig,
  applicationMethod: BuyGetRepeatApplicationMethod
): PromotionAdjustmentGroup {
  const discountType = applicationMethod.type
  const discountValue = applicationMethod.value

  const expandedItems: { item_id: string; unit_price: number }[] = []
  for (const item of items) {
    for (let i = 0; i < item.quantity; i++) {
      expandedItems.push({ item_id: item.id, unit_price: item.unit_price })
    }
  }

  expandedItems.sort((a, b) => a.unit_price - b.unit_price)

  const groupSize = config.buy_quantity + config.get_quantity
  let completeGroups = Math.floor(expandedItems.length / groupSize)

  if (applicationMethod.max_quantity != null && applicationMethod.max_quantity > 0) {
    const maxCyclesFromBuyItems = Math.floor(applicationMethod.max_quantity / config.buy_quantity)
    completeGroups = Math.min(completeGroups, maxCyclesFromBuyItems)
  }

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
      if (discountType === "percentage") {
        discount = Math.floor(item.unit_price * (discountValue / 100))
      } else {
        discount = Math.min(discountValue, item.unit_price)
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
