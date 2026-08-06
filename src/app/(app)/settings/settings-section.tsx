import type { ReactNode } from "react";

/**
 * The shell every settings tab renders into.
 *
 * Before this existed each tab picked its own container width (max-w-md,
 * max-w-lg, max-w-xl and full, across nine tabs), its own gap, and its own
 * choice of whether to lead with an explanatory paragraph at all — so
 * switching tabs re-flowed the whole page and nothing lined up with anything.
 *
 * There are exactly two widths on purpose:
 *   "form" — forms and short lists, held to a readable measure.
 *   "wide" — tables and logs, which need the room.
 * If a tab wants a third, the answer is almost always that it belongs in one
 * of these two.
 */
export function SettingsSection({
  title,
  description,
  action,
  width = "form",
  children,
}: {
  title: string;
  /** One or two sentences on what this tab is for. Include its HelpTip here. */
  description?: ReactNode;
  /** Primary action for the tab — "Add user", "New organization". */
  action?: ReactNode;
  width?: "form" | "wide";
  children: ReactNode;
}) {
  return (
    <section className={`flex flex-col gap-4 ${width === "form" ? "max-w-2xl" : ""}`}>
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
          {description && (
            <div className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {description}
            </div>
          )}
        </div>
        {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
      </header>

      {children}
    </section>
  );
}
