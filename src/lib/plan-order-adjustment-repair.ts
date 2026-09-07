/**
 * Medusa's invariant is one order_line_item_adjustment row per
 * (item_id, promotion_id). More than one means rows leaked.
 *
 * They leak because `undoLastChange_` — the rollback handler of the
 * `confirmOrderChanges` step — restores the order version, the order change,
 * the actions, the items, the summary, the shipping methods and the credit
 * lines, but never the adjustments. Its sibling `revertLastChange_` does. So
 * every order-edit confirm that fails after that step leaves one extra
 * adjustment row per promoted line, and nothing filters them out on read:
 * the `version` column on the adjustment is never used as a read filter.
 *
 * This module only reports. It picks no amounts and deletes nothing — the
 * caller passes the ids it wants gone.
 */

/**
 * Medusa hands money fields back as `BigNumber` objects, not numbers — an
 * adjustment's `amount` arrives as `BigNumber { }` whose `valueOf()` is the
 * number. Anything that reads these must coerce, or it silently gets NaN.
 */
export type MoneyValue = number | string | { valueOf(): number }

export interface OrderAdjustmentRow {
  id: string
  promotion_id?: string | null
  code?: string | null
  amount: MoneyValue
  version?: number | null
  created_at?: string | Date | null
}

export interface OrderLineWithAdjustments {
  id: string
  title?: string | null
  quantity?: MoneyValue | null
  unit_price?: MoneyValue | null
  adjustments?: OrderAdjustmentRow[] | null
}

export interface RepairGroup {
  item_id: string
  title: string | null
  quantity: number
  unit_price: number
  promotion_id: string | null
  code: string | null
  row_count: number
  amount_per_row: number
  line_subtotal: number
  recorded_discount: number
  /** newest row — never offered for deletion */
  keep_id: string
  /** every other row in the group, oldest first */
  deletable_ids: string[]
}

export interface RepairPlan {
  duplicate_groups: RepairGroup[]
  clean_group_count: number
  deletable_ids: string[]
  recorded_discount_total: number
}

const toNumber = (v: MoneyValue | null | undefined): number => {
  // Coerce unconditionally: this has to handle a plain number, a numeric
  // string, and a Medusa BigNumber (via valueOf). Only checking for a string
  // left BigNumbers falling through to Number.isFinite(object) === false,
  // which reported every amount as 0.
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const sortKey = (row: OrderAdjustmentRow): string => {
  // created_at is the real ordering, but ids are ULIDs so they sort the same
  // way and are always present.
  if (row.created_at) {
    const d = row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at)
    return `${d}|${row.id}`
  }
  return `~|${row.id}`
}

export const planOrderAdjustmentRepair = (
  lines: OrderLineWithAdjustments[]
): RepairPlan => {
  const duplicate_groups: RepairGroup[] = []
  let clean_group_count = 0
  let recorded_discount_total = 0

  for (const line of lines ?? []) {
    const byPromotion = new Map<string, OrderAdjustmentRow[]>()

    for (const row of line.adjustments ?? []) {
      const key = row.promotion_id ?? `code:${row.code ?? ""}`
      const bucket = byPromotion.get(key)
      if (bucket) {
        bucket.push(row)
      } else {
        byPromotion.set(key, [row])
      }
    }

    for (const rows of byPromotion.values()) {
      recorded_discount_total += rows.reduce((sum, r) => sum + toNumber(r.amount), 0)

      if (rows.length < 2) {
        clean_group_count++
        continue
      }

      const ordered = [...rows].sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
      const newest = ordered[ordered.length - 1]

      duplicate_groups.push({
        item_id: line.id,
        title: line.title ?? null,
        quantity: toNumber(line.quantity),
        unit_price: toNumber(line.unit_price),
        promotion_id: newest.promotion_id ?? null,
        code: newest.code ?? null,
        row_count: ordered.length,
        amount_per_row: toNumber(newest.amount),
        line_subtotal: toNumber(line.unit_price) * toNumber(line.quantity),
        recorded_discount: ordered.reduce((sum, r) => sum + toNumber(r.amount), 0),
        keep_id: newest.id,
        deletable_ids: ordered.slice(0, -1).map((r) => r.id),
      })
    }
  }

  return {
    duplicate_groups,
    clean_group_count,
    deletable_ids: duplicate_groups.flatMap((g) => g.deletable_ids),
    recorded_discount_total,
  }
}
