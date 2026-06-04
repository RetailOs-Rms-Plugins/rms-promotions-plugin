---
"@retailos-ai/rms-promotions-extension": patch
---

⏺ fix: prevent deadlock when removing cart items with non-standard promotions

computeNonStandardAdjustments called updateCartPromotionsWorkflow.run() from inside
a workflow hook when no eligible items remained, deadlocking on the cart lock.
Added insideHook flag to skip that path — promotion removal is deferred to the
route override (auto-apply) or cart.updated subscriber (code-applied).
