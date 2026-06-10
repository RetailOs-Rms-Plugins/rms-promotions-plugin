export type CartItemForSpread = { id: string; subtotal: number }

export function spreadCartAdjustment(
  amount: number,
  items: CartItemForSpread[]
): { item_id: string; amount: number }[] {
  if (!items.length) return []

  const cartSubtotal = items.reduce((sum, item) => sum + item.subtotal, 0)
  if (cartSubtotal <= 0) return []

  const effectiveAmount = Math.min(Math.abs(amount), cartSubtotal) * Math.sign(amount)

  const result: { item_id: string; amount: number }[] = []
  let distributed = 0

  for (let i = 0; i < items.length; i++) {
    const isLast = i === items.length - 1
    if (isLast) {
      result.push({ item_id: items[i].id, amount: effectiveAmount - distributed })
    } else {
      const share = effectiveAmount * (items[i].subtotal / cartSubtotal)
      result.push({ item_id: items[i].id, amount: share })
      distributed += share
    }
  }

  return result
}
