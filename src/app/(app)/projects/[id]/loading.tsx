import { Skeleton } from "@/components/ui/skeleton";

export default function ProjectLoading() {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6">
      <Skeleton className="h-[104px] rounded-2xl" />
      <div className="flex items-center gap-2">
        <Skeleton className="h-9 w-24 rounded-lg" />
        <Skeleton className="h-9 w-24 rounded-lg" />
        <Skeleton className="h-9 w-24 rounded-lg" />
      </div>
      <Skeleton className="h-96 rounded-2xl" />
    </div>
  );
}
