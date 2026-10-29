"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

import { buttonVariants } from "@/components/ui/button";
import { pageWindow, tablePageSizes } from "@/lib/table-page";
import { cn } from "cn";

export function TablePager({
  page,
  pageSize,
  total,
  pageCount,
  prevHref,
  nextHref,
  pageHrefs,
  sizeHrefs,
  onPage,
  onPageSize,
}: {
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
  prevHref?: string;
  nextHref?: string;
  pageHrefs?: { page: number; href: string }[];
  sizeHrefs?: { size: number; href: string }[];
  onPage?: (page: number) => void;
  onPageSize?: (size: number) => void;
}) {
  const router = useRouter();
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const numbers = pageHrefs?.map((item) => item.page) ?? pageWindow(page, pageCount);
  const sizes = sizeHrefs ?? tablePageSizes.map((size) => ({ size, href: "" }));

  function openPage(nextPage: number, href?: string) {
    if (onPage) {
      onPage(nextPage);
      return;
    }
    if (href) router.push(href);
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-zinc-300 bg-zinc-50 px-4 py-3 text-sm">
      <p className="text-zinc-600">
        Showing <span className="font-medium text-zinc-900">{start}</span>
        {"–"}
        <span className="font-medium text-zinc-900">{end}</span> of{" "}
        <span className="font-medium text-zinc-900">{total}</span>
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-zinc-600">
          Rows
          <select
            aria-label="Rows per page"
            className="h-9 rounded-lg border border-zinc-300 bg-white px-2 text-sm text-zinc-900"
            value={pageSize}
            onChange={(event) => {
              const size = Number(event.target.value);
              if (onPageSize) {
                onPageSize(size);
                return;
              }
              const href = sizes.find((item) => item.size === size)?.href;
              if (href) router.push(href);
            }}
          >
            {sizes.map((item) => (
              <option key={item.size} value={item.size}>
                {item.size}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-1">
          <PageButton
            label="Previous page"
            disabled={page <= 1}
            href={onPage ? undefined : prevHref}
            onClick={() => openPage(page - 1, prevHref)}
          >
            <ChevronLeft />
          </PageButton>
          {numbers.map((number) => (
            <PageButton
              key={number}
              label={`Page ${number}`}
              current={number === page}
              href={onPage ? undefined : pageHrefs?.find((item) => item.page === number)?.href}
              onClick={() => openPage(number, pageHrefs?.find((item) => item.page === number)?.href)}
            >
              {number}
            </PageButton>
          ))}
          <PageButton
            label="Next page"
            disabled={page >= pageCount}
            href={onPage ? undefined : nextHref}
            onClick={() => openPage(page + 1, nextHref)}
          >
            <ChevronRight />
          </PageButton>
        </div>
      </div>
    </div>
  );
}

function PageButton({
  children,
  label,
  href,
  current,
  disabled,
  onClick,
}: {
  children: ReactNode;
  label: string;
  href?: string;
  current?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const className = cn(buttonVariants({ variant: current ? "default" : "outline", size: "sm" }), "min-w-8 px-2");
  if (href && !disabled) {
    return (
      <Link href={href} aria-label={label} aria-current={current ? "page" : undefined} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <button
      type="button"
      aria-label={label}
      aria-current={current ? "page" : undefined}
      disabled={disabled}
      className={className}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
