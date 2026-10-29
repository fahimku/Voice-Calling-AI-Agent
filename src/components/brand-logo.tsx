import Link from "next/link";

import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" className={cn("size-8 shrink-0", className)}>
      <rect width="32" height="32" rx="8" fill="#115E59" />
      <path
        d="M9.5 13.2c1.1-2.8 3.8-4.7 6.9-4.7 4 0 7.1 2.6 7.1 6.1 0 1.7-.7 3.2-1.8 4.3"
        stroke="white"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path d="M12.2 19.4c1 1.8 2.7 3.2 4.8 3.8" stroke="#99F6E4" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="22.2" cy="22.2" r="2.3" fill="#FDE68A" />
    </svg>
  );
}

export function BrandLogo({
  href = "/dashboard",
  compact = false,
  className,
}: {
  href?: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <Link href={href} className={cn("flex min-w-0 items-center gap-2", className)}>
      <BrandMark />
      {compact ? null : (
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold tracking-tight">Calling Agent</span>
          <span className="block truncate text-xs text-muted-foreground">Outbound campaigns</span>
        </span>
      )}
    </Link>
  );
}
