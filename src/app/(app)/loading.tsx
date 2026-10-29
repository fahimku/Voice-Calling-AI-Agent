import { PageSkeleton } from "@/components/deferred-page";

export default function AppLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="mb-4 h-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full w-1/3 animate-pulse rounded-full bg-teal-700" />
      </div>
      <PageSkeleton />
    </div>
  );
}
