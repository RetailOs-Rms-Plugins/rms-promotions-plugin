---
"@retailos-ai/rms-promotions-extension": patch
---

---

Bug Fixes

- Discount stacking / negative cart totals (Entry 1): Non-standard promotions (bundle, buyget_repeat) are now mutually exclusive per item via a greedy best-deal algorithm.
  Only the highest-savings non-standard promo wins per item. Standard promotions stack after, with percentage discounts correctly recomputed on the post-bundle remaining  
  price (not the original price). A per-item budget cap prevents totals from going negative.
- Cart race condition (Entry 2): All promotion logic (auto-apply evaluation, non-standard adjustment computation) moved into the beforeRefreshingPaymentCollection workflow
  hook, running inside Medusa's distributed lock. Eliminates concurrent writers that caused duplicate adjustments, inconsistent discounts, and transient negative totals  
  during rapid cart mutations.
- Phantom promotion links (Entry 3): restoreEvictedStandardPromos now computes adjustments before linking — promos that produce no adjustments are never linked.  
  Additionally, evaluateAutoApplyPromotions now checks application_method.target_rules against cart items before auto-linking, preventing promos from appearing in  
  cart.promotions when no items match.
- Duplicate adjustment ID error (Entry 4): Resolved by Entry 2 — no concurrent writers means no duplicate key conflicts.
- Standard auto-apply promos missing adjustments on first link (Entry 8): Freshly-linked promo codes from evaluateAutoApplyPromotions are now threaded through to  
  restoreEvictedStandardPromos, which computes their adjustments via computeActions even though they're already linked.
- Rounding loss in budget cap (Entry 9): Replaced proportional scaling with Math.floor in capAdjustmentsToSubtotal with sequential capping (same algorithm as Medusa  
  native). No rounding loss when multiple standard promos are capped at remaining budget.
- Wrong price basis and Math.floor in calculators (Entry 10): computeBundle and computeBuyGetRepeat now use tax-exclusive subtotals for percentage promos and tax-inclusive
  prices for tax-inclusive bundles. All Math.floor calls on monetary amounts removed from calculators and spreadCartAdjustment.
- is_tax_inclusive not forwarded in admin routes (Entry 11): All admin CRUD route handlers (POST, PATCH, DELETE — single and batch) now forward is_tax_inclusive and  
  metadata when writing line item adjustments via addLineItemAdjustments / setLineItemAdjustments.  


Features

- Target price per item (Entry 7): bundle_size validation changed from min(2) to min(1), enabling per-item target price promotions using the existing bundle calculator.
