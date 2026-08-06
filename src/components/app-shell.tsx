"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import {
  ChevronsLeft,
  ChevronsRight,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings as SettingsIcon,
  Star,
} from "lucide-react";

import { stopImpersonation } from "@/app/(app)/impersonate-actions";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";

function ImpersonationBanner({ name, role }: { name: string; role: string }) {
  return (
    <form
      action={stopImpersonation}
      className="flex min-h-9 shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-gradient-to-r from-primary via-primary to-chart-2 px-4 py-1.5 text-center text-xs font-medium text-primary-foreground"
    >
      <span className="truncate">
        Viewing as <strong className="font-semibold">{name}</strong> ({role})
      </span>
      <button
        type="submit"
        className="flex shrink-0 items-center gap-1 rounded-full bg-primary-foreground/15 px-2.5 py-1 font-semibold hover:bg-primary-foreground/25"
      >
        <LogOut className="size-3" />
        Exit
      </button>
    </form>
  );
}

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname.startsWith(href);
}

function NavLink({
  href,
  label,
  icon: Icon,
  active,
  collapsed,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const content = (
    <Link
      href={href}
      onClick={onNavigate}
      className={`group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200 ${
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      } ${collapsed ? "justify-center px-2" : ""}`}
    >
      {active && (
        <motion.span
          layoutId="sidebar-active-pill"
          className="absolute inset-0 rounded-xl bg-primary/10"
          transition={{ type: "spring", stiffness: 400, damping: 35 }}
        />
      )}
      <Icon className="relative z-10 size-4.5 shrink-0" />
      {!collapsed && <span className="relative z-10 truncate">{label}</span>}
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger render={<div />}>{content}</TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    );
  }

  return content;
}

function SidebarContent({
  collapsed,
  onNavigate,
  navLinks,
  favorites,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
  navLinks: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }[];
  favorites: { id: string; name: string }[];
}) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col gap-1 px-3">
      {navLinks.map((link) => (
        <NavLink
          key={link.href}
          {...link}
          active={isActive(pathname, link.href)}
          collapsed={collapsed}
          onNavigate={onNavigate}
        />
      ))}

      {favorites.length > 0 && !collapsed && (
        <div className="mt-4 flex flex-col gap-1">
          <p className="px-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
            Favorites
          </p>
          {favorites.map((fav) => (
            <NavLink
              key={fav.id}
              href={`/projects/${fav.id}`}
              label={fav.name}
              icon={Star}
              active={isActive(pathname, `/projects/${fav.id}`)}
              collapsed={collapsed}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </nav>
  );
}

export function AppShell({
  name,
  email,
  role,
  favorites,
  impersonating,
  children,
}: {
  name: string;
  email: string;
  role: string;
  favorites: { id: string; name: string }[];
  impersonating?: boolean;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("sidebar-collapsed");
    if (stored) setCollapsed(stored === "1");
    setMounted(true);
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      localStorage.setItem("sidebar-collapsed", prev ? "0" : "1");
      return !prev;
    });
  }

  const navLinks = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/projects", label: "Projects", icon: FolderKanban },
    { href: "/settings", label: "Settings", icon: SettingsIcon },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      {impersonating && <ImpersonationBanner name={name} role={role} />}
      <div className="flex min-h-0 flex-1">
      {/* Desktop sidebar */}
      <motion.aside
        animate={{ width: collapsed ? 72 : 232 }}
        transition={{ duration: mounted ? 0.25 : 0, ease: [0.22, 1, 0.36, 1] }}
        className="sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar sm:flex"
      >
        <div className={`flex h-14 items-center ${collapsed ? "justify-center px-2" : "px-4"}`}>
          <Link href="/dashboard" className="flex items-center">
            <Logo iconOnly={collapsed} />
          </Link>
        </div>

        <SidebarContent collapsed={collapsed} navLinks={navLinks} favorites={favorites} />

        <div className="flex flex-col gap-2 p-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleCollapsed}
            className={`gap-2 text-muted-foreground ${collapsed ? "justify-center px-0" : "justify-start"}`}
          >
            {collapsed ? (
              <ChevronsRight className="size-4" />
            ) : (
              <>
                <ChevronsLeft className="size-4" />
                <span>Collapse</span>
              </>
            )}
          </Button>
        </div>
      </motion.aside>

      {/* Mobile sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SheetHeader className="h-14 flex-row items-center border-b px-4 py-0">
            <SheetTitle>
              <Logo />
            </SheetTitle>
          </SheetHeader>
          <div className="flex flex-1 flex-col py-3">
            <SidebarContent
              collapsed={false}
              navLinks={navLinks}
              favorites={favorites}
              onNavigate={() => setMobileOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Main column */}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col bg-gradient-to-br from-background via-background to-primary/[0.035]">
        <header className="glass-surface sticky top-0 z-40 flex h-14 items-center justify-between border-b px-4 sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="sm:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </Button>
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <UserMenu name={name} email={email} role={role} />
          </div>
        </header>

        <main className="mx-auto flex w-full min-w-0 max-w-7xl flex-1 flex-col px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>

        <footer className="py-4 text-center text-xs text-muted-foreground">
          Created by Faizan Rauf
        </footer>
      </div>
      </div>
    </div>
  );
}
