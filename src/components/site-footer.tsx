import { cn } from "@/lib/utils";

export function SiteFooter({ className }: { className?: string }) {
  return (
    <footer
      className={cn(
        "py-6 text-center text-xs text-muted-foreground",
        className,
      )}
    >
      Created by Faizan Rauf
    </footer>
  );
}
