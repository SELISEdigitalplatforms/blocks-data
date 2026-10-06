/**
 * The quiet look shared by every editable control in a property row — name,
 * type, required, description. A hairline border on a transparent fill instead
 * of a solid dark box, a soft ring on focus instead of a heavy offset one, and
 * slightly smaller text, so a row of fields reads as part of the table rather
 * than as a stack of form widgets. Height is left to each control so they keep
 * sharing one row height.
 */
export const PROPERTY_FIELD_CLASS =
  "border-border/70 bg-transparent px-2.5 text-[13px] shadow-none transition-colors placeholder:text-muted-foreground/60 hover:border-border focus:border-primary/50 focus:ring-1 focus:ring-primary/30 focus:ring-offset-0 focus-visible:border-primary/50 focus-visible:ring-1 focus-visible:ring-primary/30 focus-visible:ring-offset-0";
