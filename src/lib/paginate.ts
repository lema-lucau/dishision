// Shared, pure pagination math (batch-2 H). Screens keep their own page/size
// state; this just slices a list and clamps an out-of-range page the same way
// ManageVisibilityScreen does, so the arithmetic is testable in one place.

export interface PageResult<T> {
  /** The items on the (clamped) current page. */
  pageItems: T[];
  /** Total number of pages, never below 1 (an empty list has one empty page). */
  totalPages: number;
  /** The requested page clamped into [1, totalPages]. */
  clampedPage: number;
}

export function paginate<T>(list: T[], page: number, pageSize: number): PageResult<T> {
  const size = Math.max(1, Math.floor(pageSize));
  const totalPages = Math.max(1, Math.ceil(list.length / size));
  const clampedPage = Math.min(Math.max(1, Math.floor(page)), totalPages);
  const start = (clampedPage - 1) * size;
  return { pageItems: list.slice(start, start + size), totalPages, clampedPage };
}
