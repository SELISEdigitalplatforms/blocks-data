import { tStatic } from "@seliseblocks/genesis-os/i18n";
/** Faceted filter options (legacy labels; reused from former UILM “translation status” literals). */
export const translationFilterOptions = [
  { value: "No_translation", get label() { return tStatic("data.idp.iam", "TABLE_FILTER_OPTIONS.NO_TRANSLATION"); } },
  { value: "Complete", get label() { return tStatic("data.idp.iam", "TABLE_FILTER_OPTIONS.COMPLETE"); } },
] as const;
