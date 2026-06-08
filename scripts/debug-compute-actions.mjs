/**
 * [DEBUG-b7e3] Simulates Medusa's computeActions budget logic
 * to verify that BUNDLE3FOR25 consumes all item budgets,
 * leaving nothing for 10off.
 *
 * Usage: node scripts/debug-compute-actions.mjs
 */

// Simulate the shared appliedPromotionsMap from Medusa's computeActions
// Data from DB: BUNDLE3FOR25 (fixed, value=25, once, max_qty=7), 10off (percentage, value=10, across, order)

const promotions = [
  {
    code: "BUNDLE3FOR25",
    type: "standard",
    value: 25,
    am_type: "fixed",
    allocation: "once",
    target_type: "items",
    max_quantity: 7,
  },
  {
    code: "10off",
    type: "standard",
    value: 10,
    am_type: "percentage",
    allocation: "across",
    target_type: "order",
    max_quantity: null,
  },
];

// Sorted by value DESC (as Medusa does)
promotions.sort((a, b) => b.value - a.value);

// Simulated cart items (3x Medusa Sweatshirt at 10€ each)
const items = [
  { id: "item_1", title: "Medusa Sweatshirt", unit_price: 10, quantity: 3, subtotal: 30 },
];

console.log("=== Simulating Medusa computeActions ===\n");
console.log("Items:", items.map(i => `${i.title} x${i.quantity} @ ${i.unit_price}€ (subtotal: ${i.subtotal}€)`).join(", "));
console.log("Promotions (sorted by value DESC):", promotions.map(p => p.code).join(", "));
console.log();

// Shared budget map (item_id -> total applied discount)
const appliedPromotionsMap = new Map();

for (const promo of promotions) {
  console.log(`--- Processing ${promo.code} (${promo.am_type} ${promo.value}, ${promo.allocation}, target: ${promo.target_type}) ---`);

  const isTargetOrder = promo.target_type === "order";
  const allocationOverride = isTargetOrder ? "across" : undefined;
  const allocation = promo.allocation || allocationOverride;

  let applicableItems = [...items];

  if (allocation === "across") {
    // Calculate remaining item value after previous promos
    let lineItemsAmount = 0;
    for (const item of applicableItems) {
      const applied = appliedPromotionsMap.get(item.id) ?? 0;
      lineItemsAmount += item.subtotal - applied;
    }
    console.log(`  lineItemsAmount (remaining after previous promos): ${lineItemsAmount}`);

    if (lineItemsAmount <= 0) {
      console.log(`  ⚠️  lineItemsAmount <= 0 → RETURNING EMPTY (no adjustments produced!)`);
      console.log(`  → ${promo.code} produces NO adjustments → will be REMOVED from cart by updateCartPromotionsStep(REPLACE)\n`);
      continue;
    }

    // For percentage across: compute proportion-based adjustments
    for (const item of applicableItems) {
      const applied = appliedPromotionsMap.get(item.id) ?? 0;
      const remaining = item.subtotal - applied;
      const proportion = remaining / lineItemsAmount;
      const discountBase = promo.am_type === "percentage"
        ? remaining * (promo.value / 100)
        : promo.value * proportion;
      const amount = Math.min(discountBase, remaining);
      console.log(`  Item ${item.id}: remaining=${remaining}, discount=${amount.toFixed(2)}`);
      appliedPromotionsMap.set(item.id, applied + amount);
    }
  } else if (allocation === "once") {
    // Sort ascending for "once" allocation
    applicableItems.sort((a, b) => a.unit_price - b.unit_price);
    let remainingQuota = promo.max_quantity ?? 0;

    for (const item of applicableItems) {
      if (remainingQuota <= 0) break;

      const applied = appliedPromotionsMap.get(item.id) ?? 0;
      const effectiveMaxQty = Math.min(remainingQuota, item.quantity);

      // For "once" → treated as "each" with quota
      // Fixed: value per unit, capped at (unit_price - already_applied_per_unit)
      const perUnitApplied = applied / item.quantity;
      const perUnitRemaining = item.unit_price - perUnitApplied;
      const perUnitDiscount = Math.min(promo.value, perUnitRemaining);
      const amount = perUnitDiscount * effectiveMaxQty;

      console.log(`  Item ${item.id}: qty=${item.quantity}, effectiveMaxQty=${effectiveMaxQty}, perUnitDiscount=${perUnitDiscount}, total=${amount}`);
      appliedPromotionsMap.set(item.id, applied + amount);

      remainingQuota -= effectiveMaxQty;
    }
  }

  console.log(`  appliedPromotionsMap: ${JSON.stringify(Object.fromEntries(appliedPromotionsMap))}\n`);
}

console.log("=== RESULT ===");
console.log("Final appliedPromotionsMap:", Object.fromEntries(appliedPromotionsMap));
console.log("\nConclusion:");
const totalApplied = Array.from(appliedPromotionsMap.values()).reduce((s, v) => s + v, 0);
const totalSubtotal = items.reduce((s, i) => s + i.subtotal, 0);
if (totalApplied >= totalSubtotal) {
  console.log("✗ BUNDLE3FOR25 consumed entire item budget → 10off produces 0 adjustments → gets REMOVED from cart");
} else {
  console.log("✓ Some budget remains for 10off");
}
