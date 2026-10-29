export const tablePageSizes = [10, 25, 50, 100] as const;

export type TablePageSize = (typeof tablePageSizes)[number];

export const defaultTablePageSize: TablePageSize = 10;

export function parsePageSize(value: string | undefined, fallback: TablePageSize = defaultTablePageSize): TablePageSize {
  const size = Number(value);
  return tablePageSizes.find((option) => option === size) ?? fallback;
}

export function pagerLinkSet(page: number, pageCount: number, hrefFor: (page: number) => string) {
  return {
    prevHref: page > 1 ? hrefFor(page - 1) : undefined,
    nextHref: page < pageCount ? hrefFor(page + 1) : undefined,
    pageHrefs: pageWindow(page, pageCount).map((number) => ({ page: number, href: hrefFor(number) })),
  };
}

export function sizeLinkSet(hrefFor: (size: TablePageSize) => string) {
  return tablePageSizes.map((size) => ({ size, href: hrefFor(size) }));
}

export function pageWindow(page: number, pageCount: number) {
  const width = 5;
  const end = Math.min(pageCount, Math.max(page + 2, width));
  const start = Math.max(1, end - width + 1);
  const last = Math.min(pageCount, start + width - 1);
  return Array.from({ length: Math.max(0, last - start + 1) }, (_, index) => start + index);
}
