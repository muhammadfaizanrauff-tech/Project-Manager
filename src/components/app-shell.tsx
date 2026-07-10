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
  Menu,
  Settings as SettingsIcon,
} from "lucide-react";

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

const NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

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
}: {
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col gap-1 px-3">
      {NAV_LINKS.map((link) => (
        <NavLink
          key={link.href}
          {...link}
          active={isActive(pathname, link.href)}
          collapsed={collapsed}
          onNavigate={onNavigate}
        />
      ))}
    </nav>
  );
}

export function AppShell({
  name,
  email,
  role,
  children,
}: {
  name: string;
  email: string;
  role: string;
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

  return (
    <div className="flex min-h-screen">
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

        <SidebarContent collapsed={collapsed} />

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
            <SidebarContent collapsed={false} onNavigate={() => setMobileOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      {/* Main column */}
      <div className="flex min-h-screen flex-1 flex-col">
        <header className="glass-surface sticky top-0 z-40 flex h-14 items-center justify-between border-b px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="sm:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="size-5" />
            </Button>
          </div>
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <UserMenu name={name} email={email} role={role} />
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>

        <footer className="py-4 text-center text-xs text-muted-foreground">
          Created by Faizan Rauf
        </footer>
      </div>
    </div>
  );
}
