"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Bot,
  LayoutDashboard,
  Menu,
  Megaphone,
  Phone,
  Settings,
} from "lucide-react";

import { logout } from "@/app/(auth)/actions";
import { BrandLogo } from "@/components/brand-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const links = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/calls", label: "Calls", icon: Phone },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {links.map((link) => {
        const active =
          link.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname === link.href || pathname.startsWith(`${link.href}/`);
        const Icon = link.icon;

        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            onClick={onNavigate}
            className={cn(
              "flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent/70",
            )}
          >
            <Icon className="size-4" />
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

function ModeBadge({ mode }: { mode: "mock" | "live" }) {
  const live = mode === "live";
  return (
    <Badge
      variant="outline"
      className={live ? "border-green-300 bg-green-100 text-green-900" : "border-yellow-400 bg-yellow-100 text-yellow-950"}
    >
      {live ? "LIVE MODE" : "MOCK MODE"}
    </Badge>
  );
}

function AccountFooter({ email }: { email: string }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="truncate text-xs text-muted-foreground" title={email}>
        {email}
      </p>
      <form action={logout}>
        <Button type="submit" variant="outline" className="w-full">
          Log out
        </Button>
      </form>
    </div>
  );
}

function MobileNav({ email }: { email: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={<Button variant="outline" size="icon" />}
        aria-label="Open menu"
      >
        <Menu />
      </SheetTrigger>
      <SheetContent side="left" className="bg-sidebar text-sidebar-foreground">
        <SheetHeader>
          <SheetTitle>
            <BrandLogo />
          </SheetTitle>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-6 px-4 pb-4">
          <NavLinks onNavigate={() => setOpen(false)} />
          <div className="mt-auto">
            <AccountFooter email={email} />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function AppShell({
  email,
  mode,
  children,
}: {
  email: string;
  mode: "mock" | "live";
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-svh bg-background">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
        <div className="px-4 py-5">
          <BrandLogo />
        </div>
        <div className="flex-1 px-2">
          <NavLinks />
        </div>
        <div className="border-t border-sidebar-border p-3">
          <AccountFooter email={email} />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b px-4 py-3">
          <div className="md:hidden">
            <MobileNav email={email} />
          </div>
          <BrandLogo compact className="md:hidden" />
          <div className="ml-auto">
            <ModeBadge mode={mode} />
          </div>
        </header>
        <main className="flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
