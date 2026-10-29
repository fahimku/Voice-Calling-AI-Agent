"use client"

import * as React from "react"
import { cn } from "cn"

function Table({
  className,
  footer,
  ...props
}: React.ComponentProps<"table"> & { footer?: React.ReactNode }) {
  return (
    <div
      data-slot="table-container"
      className="overflow-hidden rounded-xl border-2 border-zinc-300 bg-white shadow-sm"
    >
      <div className="w-full overflow-x-auto">
        <table
          data-slot="table"
          className={cn("w-full min-w-[40rem] border-collapse caption-bottom text-sm", className)}
          {...props}
        />
      </div>
      {footer}
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn(
        "bg-teal-800 text-white [&_tr]:border-b [&_tr]:border-teal-900 [&_tr]:bg-teal-800 [&_tr]:hover:bg-teal-800",
        className,
      )}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn(
        "[&_tr:nth-child(even)]:bg-zinc-50 [&_tr:last-child]:border-b-0 [&_tr:last-child_td]:border-b-0",
        className,
      )}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn("border-t bg-zinc-50 font-medium [&>tr]:last:border-b-0", className)}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b border-zinc-300 transition-colors hover:bg-teal-50 data-[state=selected]:bg-teal-50",
        className,
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-11 border-r border-white/15 px-4 text-left align-middle text-xs font-semibold tracking-wide whitespace-nowrap text-white uppercase last:border-r-0 [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "border-r border-b border-zinc-200 px-4 py-3 align-middle whitespace-nowrap text-zinc-800 last:border-r-0 [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
