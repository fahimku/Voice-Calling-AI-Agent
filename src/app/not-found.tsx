import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-lg flex-col justify-center gap-3 px-4">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="text-sm text-muted-foreground">That page does not exist. Head back to the dashboard.</p>
      <Link href="/dashboard" className="text-sm hover:underline">
        Go to the dashboard
      </Link>
    </main>
  );
}
