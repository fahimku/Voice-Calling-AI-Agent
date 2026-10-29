export default function AuthLoading() {
  return (
    <div className="w-full max-w-sm animate-pulse rounded-xl border bg-card p-6" aria-busy="true">
      <p className="sr-only">Loading</p>
      <div className="mb-4 h-8 w-8 rounded-lg bg-muted" />
      <div className="h-6 w-32 rounded bg-muted" />
      <div className="mt-6 h-10 rounded-lg bg-muted" />
      <div className="mt-3 h-10 rounded-lg bg-muted" />
      <div className="mt-4 h-10 rounded-lg bg-muted" />
    </div>
  );
}