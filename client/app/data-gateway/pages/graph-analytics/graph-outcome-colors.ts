/**
 * One colour per outcome, shared by the outcome tiles, the stacked bars and the per-schema table —
 * the same category must not change colour between two views on the same page.
 *
 * The tokens carry different steps per theme (see globals.css): the yellow that reads well as a bar
 * on the dark card is unreadable as text on white, so light mode uses darker, text-safe steps.
 */
export const OUTCOME_COLORS = {
  allows: "hsl(var(--outcome-allows))",
  denies: "hsl(var(--outcome-denies))",
  errors: "hsl(var(--outcome-errors))",
} as const;
