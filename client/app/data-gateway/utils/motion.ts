/**
 * Motion tokens.
 *
 * The same durations and curves are declared as CSS custom properties in
 * `app/styles/globals.css`; these are the JS-side mirrors, for the places that
 * need the number itself — an unmount that has to outlast a collapse, a
 * `setTimeout` that has to land after a panel has settled.
 *
 * Keep the two in step. Anything that only needs to *style* a transition
 * should use the CSS variables (or the `dg-*` utilities) rather than importing
 * from here, so there is one source of truth in the stylesheet.
 */
export const MOTION = {
  /** Hover, focus, pressed — paint-only changes that should feel instant. */
  fast: 120,
  /** Fades, cross-fades, small reveals. */
  base: 180,
  /** Panels and columns growing or collapsing. */
  panel: 260,
} as const;

export const EASE = {
  standard: "cubic-bezier(0.32, 0.72, 0, 1)",
  enter: "cubic-bezier(0.16, 1, 0.3, 1)",
  exit: "cubic-bezier(0.4, 0, 1, 1)",
} as const;

/** Layout constants for the schema shell, shared by the columns and their
 *  contents so the animated frame and the fixed-width panel inside it can
 *  never disagree about a width. */
export const SHELL = {
  explorerWidth: 264,
  railWidth: 52,
  inspectorWidth: 460,
  inspectorWidthExpanded: 480,
} as const;
