import { LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({
  className,
  iconOnly = false,
}: {
  className?: string;
  iconOnly?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-sm">
        <LayoutGrid className="size-4.5" strokeWidth={2.25} />
      </div>
      {!iconOnly && (
        <span className="text-[15px] font-semibold tracking-tight">
          Project Manager
        </span>
      )}
    </div>
  );
}
