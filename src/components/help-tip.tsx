"use client";

import Link from "next/link";
import { HelpCircle } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * The little "?" that sits next to anything that needs explaining.
 *
 * Hovering (or focusing — it's a real button, so keyboard and screen readers
 * get it too) shows a one-or-two-sentence explanation. When `topic` is given
 * it also links straight to that section of the Handbook, so the tooltip is a
 * summary and the Handbook is the full story. Keep `topic` in sync with the
 * section ids in src/app/(app)/handbook/handbook-content.tsx.
 */
export function HelpTip({
  children,
  topic,
  side = "top",
  className,
  label = "What's this?",
}: {
  children: React.ReactNode;
  topic?: string;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
  label?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            className={cn(
              "inline-flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:text-primary focus-visible:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              className,
            )}
          />
        }
      >
        <HelpCircle className="size-3.5" />
      </TooltipTrigger>
      <TooltipContent side={side} className="max-w-xs flex-col items-start gap-1 py-2 text-left">
        <span className="block leading-relaxed">{children}</span>
        {topic && (
          <Link
            href={`/handbook#${topic}`}
            className="font-medium underline underline-offset-2 opacity-80 hover:opacity-100"
          >
            Read more in the Handbook →
          </Link>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * A heading with its help marker attached — the common case, so it isn't
 * hand-assembled at every call site.
 */
export function HelpLabel({
  children,
  help,
  topic,
  className,
}: {
  children: React.ReactNode;
  help: React.ReactNode;
  topic?: string;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      {children}
      <HelpTip topic={topic}>{help}</HelpTip>
    </span>
  );
}
