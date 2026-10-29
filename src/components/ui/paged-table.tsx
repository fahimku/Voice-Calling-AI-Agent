"use client";

import { Children, useState, type ReactNode } from "react";

import { TablePager } from "@/components/ui/table-pager";
import { Table, TableBody, TableHeader } from "@/components/ui/table";
import { defaultTablePageSize, tablePageSizes, type TablePageSize } from "@/lib/table-page";

export function PagedTable({ header, rows }: { header: ReactNode; rows: ReactNode }) {
  const items = Children.toArray(rows);
  const [pageSize, setPageSize] = useState<TablePageSize>(defaultTablePageSize);
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visible = items.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <Table
      footer={
        <TablePager
          page={safePage}
          pageSize={pageSize}
          total={items.length}
          pageCount={pageCount}
          onPage={setPage}
          onPageSize={(size) => {
            const next = tablePageSizes.find((option) => option === size) ?? defaultTablePageSize;
            setPageSize(next);
            setPage(1);
          }}
        />
      }
    >
      <TableHeader>{header}</TableHeader>
      <TableBody>{visible}</TableBody>
    </Table>
  );
}
