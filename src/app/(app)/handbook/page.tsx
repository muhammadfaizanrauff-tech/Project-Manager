import type { Metadata } from "next";
import { BookOpen } from "lucide-react";

import { FadeIn } from "@/components/motion/fade-in";
import { HandbookContent } from "./handbook-content";

export const metadata: Metadata = {
  title: "Handbook · Project Manager",
  description: "The complete manual — hierarchy, roles, and every feature explained.",
};

export default function HandbookPage() {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6">
      <FadeIn>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <BookOpen className="size-6 text-primary" />
          Handbook
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          The complete manual: how the system is structured, who can see what, and how every
          feature works. The <strong>?</strong> markers throughout the app link back to the
          relevant section here.
        </p>
      </FadeIn>

      <HandbookContent />
    </div>
  );
}
