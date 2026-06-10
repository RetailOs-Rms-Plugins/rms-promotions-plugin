export interface EligibleItem {
  id: string
  unit_price: number
  subtotal: number
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
  is_tax_inclusive?: boolean
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
  is_tax_inclusive?: boolean
}

export function computeBundle(
  promotionId: string,
  items: EligibleItem[],
  config: BundleModeConfig,
  applicationMethod: BundleApplicationMethod
): PromotionAdjustmentGroup {
  const bundlePrice = applicationMethod.value
  const useTaxInclusive = applicationMethod.is_tax_inclusive ?? false

  const expandedItems: { item_id: string; unitAmount: number }[] = []
  for (const item of items) {
    const unitAmount = useTaxInclusive ? item.unit_price : item.subtotal / item.quantity
    for (let i = 0; i < item.quantity; i++) {
      expandedItems.push({ item_id: item.id, unitAmount })
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

    const groupOriginal = groupItems.reduce((sum, i) => sum + i.unitAmount, 0)
    const groupSavings = groupOriginal - bundlePrice

    if (groupSavings <= 0) continue

    let distributed = 0
    for (let i = 0; i < groupItems.length; i++) {
      const item = groupItems[i]
      const isLast = i === groupItems.length - 1
      const share = isLast
        ? groupSavings - distributed
        : groupSavings * (item.unitAmount / groupOriginal)

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
  const useTaxInclusive = discountType === "fixed" && (applicationMethod.is_tax_inclusive ?? false)

  const expandedItems: { item_id: string; unitAmount: number }[] = []
  for (const item of items) {
    const unitAmount = useTaxInclusive ? item.unit_price : item.subtotal / item.quantity
    for (let i = 0; i < item.quantity; i++) {
      expandedItems.push({ item_id: item.id, unitAmount })
    }
  }

  expandedItems.sort((a, b) => a.unitAmount - b.unitAmount)

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
        discount = item.unitAmount * (discountValue / 100)
      } else {
        discount = Math.min(discountValue, item.unitAmount)
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

export function resolveExclusiveNonStandard(
  groups: PromotionAdjustmentGroup[]
): PromotionAdjustmentGroup[] {
  const withAdjustments = groups.filter((g) => g.adjustments.length > 0)
  const sorted = [...withAdjustments].sort((a, b) => {
    const savingsA = a.adjustments.reduce((sum, adj) => sum + adj.amount, 0)
    const savingsB = b.adjustments.reduce((sum, adj) => sum + adj.amount, 0)
    return savingsB - savingsA
  })

  const claimedItems = new Set<string>()
  const winners: PromotionAdjustmentGroup[] = []

  for (const group of sorted) {
    const itemIds = group.adjustments.map((a) => a.item_id)
    if (itemIds.some((id) => claimedItems.has(id))) continue

    winners.push(group)
    for (const id of itemIds) {
      claimedItems.add(id)
    }
  }

  return winners
}

export function capAdjustmentsToSubtotal(
  itemSubtotals: Map<string, number>,
  priorityAdjustments: { item_id: string; amount: number }[],
  otherAdjustments: { item_id: string; amount: number; [key: string]: any }[]
): { item_id: string; amount: number; [key: string]: any }[] {
  const remainingByItem = new Map<string, number>()
  for (const [itemId, subtotal] of itemSubtotals) {
    remainingByItem.set(itemId, subtotal)
  }

  for (const adj of priorityAdjustments) {
    const remaining = remainingByItem.get(adj.item_id) ?? 0
    remainingByItem.set(adj.item_id, remaining - adj.amount)
  }

  const sorted = [...otherAdjustments].sort((a, b) => b.amount - a.amount)

  const capped = sorted.map((adj) => {
    const remaining = Math.max(0, remainingByItem.get(adj.item_id) ?? 0)
    const cappedAmount = Math.min(adj.amount, remaining)
    remainingByItem.set(adj.item_id, remaining - cappedAmount)
    return { ...adj, amount: cappedAmount }
  })

  return [...priorityAdjustments, ...capped]
}
