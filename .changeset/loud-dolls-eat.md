---
"@retailos-ai/rms-promotions-extension": patch
---

Remove non-standard promotions from cart when computed adjustments are empty.

Bundle and buy-get-repeat promotions could remain visible on the cart even when the quantity threshold wasn't met (e.g. a "3 in 50" bundle with only 2 items). The promotion passed extended rule
evaluation and was added to the cart, but the adjustment calculator correctly returned zero adjustments — the subscriber never removed the promotion in that case. Now, when a non-standard  
 promotion computes to zero adjustments, it is automatically removed from the cart.
