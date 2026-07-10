import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  Kanban,
  LineChart,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";

import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FadeIn } from "@/components/motion/fade-in";

const highlights = [
  {
    icon: Kanban,
    title: "Table, Kanban & dashboards",
    description:
      "Switch between a spreadsheet-style table, a drag-and-drop board, and live analytics — per project or across the whole workspace.",
    gradient: "from-violet-500 to-indigo-600",
  },
  {
    icon: Users,
    title: "Role-based access",
    description:
      "Admin, Manager, and Member roles with permissions enforced all the way down to the database, not just the UI.",
    gradient: "from-fuchsia-500 to-pink-600",
  },
  {
    icon: LineChart,
    title: "Real-time everywhere",
    description:
      "Every edit, comment, and status change syncs instantly to everyone viewing the same project — no refresh needed.",
    gradient: "from-sky-500 to-cyan-600",
  },
];

const stats = [
  { icon: ShieldCheck, label: "Row-level security on every table" },
  { icon: CalendarClock, label: "Live deadlines & overdue tracking" },
  { icon: Sparkles, label: "Built for fast-moving teams" },
];

export default function Home() {
  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <div className="gradient-mesh pointer-events-none absolute inset-0" />

      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button
            size="sm"
            className="rounded-full px-4 shadow-glow"
            nativeButton={false}
            render={<Link href="/login" />}
          >
            Sign in
            <ArrowRight className="size-3.5" />
          </Button>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col items-center px-6 pb-24 pt-16 text-center sm:pt-24">
        <FadeIn>
          <span className="inline-flex items-center gap-1.5 rounded-full border bg-background/60 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur">
            <Sparkles className="size-3.5 text-primary" />
            Real-time task &amp; project management
          </span>
        </FadeIn>

        <FadeIn delay={0.08}>
          <h1 className="mt-6 max-w-2xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
            Run every project,{" "}
            <span className="text-gradient">task, and teammate</span> from
            one place.
          </h1>
        </FadeIn>

        <FadeIn delay={0.14}>
          <p className="mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">
            Projects, categories, tasks, comments, and dashboards — all synced
            live across your team, wherever they are.
          </p>
        </FadeIn>

        <FadeIn delay={0.2}>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button
              size="lg"
              className="rounded-full px-6 shadow-glow transition-transform hover:scale-[1.02]"
              nativeButton={false}
              render={<Link href="/login" />}
            >
              Sign in to your workspace
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </FadeIn>

        <FadeIn delay={0.28}>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
            {stats.map(({ icon: Icon, label }) => (
              <span key={label} className="flex items-center gap-1.5">
                <Icon className="size-3.5 text-primary" />
                {label}
              </span>
            ))}
          </div>
        </FadeIn>

        <div className="mt-20 grid w-full gap-4 text-left sm:grid-cols-3">
          {highlights.map(({ icon: Icon, title, description, gradient }, i) => (
            <FadeIn key={title} delay={0.32 + i * 0.08} y={16}>
              <Card className="h-full gap-3 rounded-2xl border-border/60 p-5 shadow-sm">
                <div
                  className={`flex size-10 items-center justify-center rounded-xl bg-gradient-to-br ${gradient} text-white shadow-sm`}
                >
                  <Icon className="size-5" />
                </div>
                <h3 className="text-sm font-semibold">{title}</h3>
                <p className="text-sm text-muted-foreground">{description}</p>
              </Card>
            </FadeIn>
          ))}
        </div>
      </main>

      <SiteFooter className="relative z-10" />
    </div>
  );
}
