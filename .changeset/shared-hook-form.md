---
"@retailos-ai/rms-promotions-extension": minor
---

Declare `react-hook-form` (`^7.55.0`) as a peerDependency — host apps must now supply it.
Every Medusa host already resolves `react-hook-form@7.83.0` via `@medusajs/dashboard`, so in
practice no action is needed; strict-peer package managers will now tell you if that ever stops
being true.

Previously the plugin imported `react-hook-form` in its admin rules editor and promotion-mode
form but declared it nowhere, so the plugin build inlined a private frozen copy into the admin
bundle (193,471 → 98,514 bytes after this fix). A duplicate copy also means a duplicate React
form context for any host component rendered inside those forms. Declaring the peer flips the
build to importing the host's single copy.

No component behaviour changes.
