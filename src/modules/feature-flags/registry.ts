/**
 * Phase 10.4 — Feature flag registry.
 *
 * Single source of truth for every flag the codebase calls
 * `useFlag('<key>')` against. The seeder (`seedRegisteredFlags`) walks
 * this list on API boot and inserts a `FeatureFlag` row for each
 * missing key, with the same default value the code falls back to.
 *
 * **The rule going forward**: any time we ship a feature gated by
 * `useFlag('<key>', defaultValue)` in the storefront, we add a row
 * here in the same PR. That way:
 *  - Every flag the code uses is **discoverable in /admin/feature-flags**
 *    on first deploy — admin can find and toggle it without the
 *    engineer pre-creating a row by hand.
 *  - Default value lives in **one place** (this file), not split
 *    between code defaults and DB rows that may drift.
 *  - Adding a flag is one line of code + one entry here, no SQL.
 *
 * The seeder is **insert-only**. Rows that already exist are left
 * alone — admins may have flipped `isActive`, edited `defaultValue`,
 * or added targeting rules; we never overwrite their work.
 */

export interface FeatureFlagDef {
  /// Stable key passed to `useFlag('<key>')` from client code.
  /// snake_case convention.
  key: string;
  /// Human-readable label shown in the admin list.
  name: string;
  /// Short explanation — what the flag controls, what flipping it
  /// does. Surfaces in the admin row.
  description: string;
  /// Default boolean returned when no targeting rule matches AND no
  /// admin override has been applied. **Must equal the default the
  /// client code passes to `useFlag()`** so the in-DB state and the
  /// code default agree.
  defaultValue: boolean;
}

export const FEATURE_FLAG_REGISTRY: FeatureFlagDef[] = [
  {
    key: 'animated_place_order_button',
    name: 'Animated Place Order button',
    description:
      'GSAP truck animation on the final Pay button at /checkout/payment. Default ON. Flip to OFF as an instant kill-switch if the animation regresses (browser-specific 3D bug, GSAP issue, perf complaint) — customers immediately see the plain "Pay {amount}" button instead, no redeploy needed.',
    defaultValue: true,
  },
  {
    key: 'animated_pdp_add_to_cart_button',
    name: 'Animated PDP Add to Cart button',
    description:
      'GSAP cart animation on the main Add-to-Cart button at /product/<slug> (PDP). T-shirt drops into a cart, cart rolls across, label fades back. Default ON. Flip to OFF as an instant kill-switch if the animation regresses on a specific browser, breaks add-to-cart, or shows a perf complaint — customers immediately see the plain "Add to Cart — {price}" button. No redeploy needed.',
    defaultValue: true,
  },
  {
    key: 'animated_card_add_to_cart_button',
    name: 'Animated product-card Add to Cart button',
    description:
      'Same shirt-into-cart animation as the PDP button, scaled down for the small "Add to Cart" button on every product card across every shelf (homepage rows, shop pages, search, country pages, related products). Light theme to match the white card surface. Default ON. Flip to OFF independently of the PDP flag if cards perform poorly with many cards on screen at once, or if the animation feels redundant in browse mode — customers immediately see the plain "Add to Cart" button on cards while the PDP animation stays on. No redeploy needed.',
    defaultValue: true,
  },
  {
    key: 'floating_mobile_cart',
    name: 'Floating mobile cart bubble',
    description:
      'Mobile-only floating cart button that appears once the cart has at least one item. Draggable to any edge of the screen, position persists across pages, taps route to /cart. Fixes the missing-cart-icon-on-mobile gap (the desktop header cart is hidden under md:). Default ON. Flip to OFF as a kill-switch if the bubble breaks scrolling on a specific device or covers something it shouldn\'t — customers fall back to the existing /cart link in the mobile menu drawer. No redeploy needed.',
    defaultValue: true,
  },
  {
    key: 'animated_success_delivery',
    name: 'Animated delivery scene on /checkout/success',
    description:
      'Replaces the static green checkmark on the order-success page with a GSAP scene: an amber-cargo AZM truck drives in, rear doors open, a box hops out, a tick stamps on it. ~4.8s end-to-end. Default ON. Flip to OFF as an instant kill-switch if the scene regresses (GSAP issue, mobile layout bug, slow-device perf complaint) — customers immediately see the plain green check + "Order Confirmed" copy that the page used before. No redeploy needed. prefers-reduced-motion users always see the static end state.',
    defaultValue: true,
  },
  {
    key: 'share_as_image',
    name: 'Share product as image (PDP)',
    description:
      'Adds a "Share as image" item to the PDP share popover. Generates a 1080x1080 PNG card (navy + amber, product photo + price + brand) for sharing to WhatsApp / IG status / SMS; desktop downloads the PNG instead. Default OFF until smoke-tested in prod. Flip to OFF as an instant kill-switch if generation throws — the link-share targets in the same popover remain available. No redeploy needed.',
    defaultValue: false,
  },
];
