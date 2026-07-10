import Link from "next/link";
import { ArrowRight, Kanban, LineChart, Users } from "lucide-react";

import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const highlights = [
  {
    icon: Kanban,
    title: "Table, Kanban & Timeline",
    description:
      "Switch between a spreadsheet-style table, drag-and-drop board, and calendar/Gantt views.",
  },
  {
    icon: Users,
    title: "Role-based access",
    description:
      "Admin, Manager, and Member roles with permissions enforced down to the database.",
  },
  {
    icon: LineChart,
    title: "Live dashboards",
    description:
      "Per-project and global analytics that update in real time as work happens.",
  },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-gradient-to-b from-background to-muted/40">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button
            size="sm"
            className="rounded-full px-4"
            nativeButton={false}
            render={<Link href="/login" />}
          >
            Sign in
            <ArrowRight className="size-3.5" />
          </Button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center px-6 pb-24 pt-16 text-center sm:pt-24">
        <span className="rounded-full border bg-background/60 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur">
          Real-time task &amp; project management
        </span>
        <h1 className="mt-6 max-w-2xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Run every project, task, and teammate from one place.
        </h1>
        <p className="mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
          Projects, categories, tasks, comments, and dashboards — all synced
          live across your team, wherever they are.
        </p>
        <div className="mt-8 flex items-center gap-3">
          <Button
            size="lg"
            className="rounded-full px-6"
            nativeButton={false}
            render={<Link href="/login" />}
          >
            Sign in to your workspace
            <ArrowRight className="size-4" />
          </Button>
        </div>

        <div className="mt-20 grid w-full gap-4 text-left sm:grid-cols-3">
          {highlights.map(({ icon: Icon, title, description }) => (
            <Card
              key={title}
              className="gap-3 rounded-2xl border-border/60 p-5 shadow-sm"
            >
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-4.5" />
              </div>
              <h3 className="text-sm font-semibold">{title}</h3>
              <p className="text-sm text-muted-foreground">{description}</p>
            </Card>
          ))}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
