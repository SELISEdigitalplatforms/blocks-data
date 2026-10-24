/**
 * The page sizes worth offering for a list of `totalCount` rows: every size up to
 * and including the first one that fits all rows (larger ones would show the same
 * single page), plus the current size so the selector always has a matching value.
 */
export function getVisiblePageSizeOptions(
  pageSizeOptions: readonly number[],
  totalCount: number,
  pageSize: number,
): number[] {
  const sorted = [...new Set(pageSizeOptions)].sort((a, b) => a - b);
  return sorted.filter(
    (size, index) => index === 0 || sorted[index - 1] < totalCount || size === pageSize,
  );
}

/**
 * Whether a pager has nothing to offer: every row already fits on the first page and
 * no smaller page size is available. Callers on a later page keep the pager so a
 * shrinking list never strands the user without a way back.
 */
export function isPaginationRedundant(
  pageSizeOptions: readonly number[],
  totalCount: number,
  pageSize: number,
  isFirstPage: boolean,
): boolean {
  return isFirstPage && totalCount <= Math.min(pageSize, ...pageSizeOptions);
}
