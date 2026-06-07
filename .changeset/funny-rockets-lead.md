---
"@retailos-ai/rms-promotions-extension": patch
---

⏺ Fix double discount on standard promotions with auto-apply enabled. When both the route handler and cart.updated subscriber called evaluateAutoApplyPromotions concurrently, each independently determined the promo should be added
and triggered updateCartPromotionsWorkflow(ADD), creating duplicate line item adjustments. Added per-cart in-memory lock to serialize concurrent calls so the second caller sees the promo already applied and skips.
