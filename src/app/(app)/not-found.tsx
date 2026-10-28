import Link from "next/link";

export default function AppNotFound() {
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-3 py-10">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="text-sm text-muted-foreground">That page is not in this account. Check the link and try again.</p>
      <Link href="/dashboard" className="text-sm hover:underline">
        Back to the dashboard
      </Link>
    </div>
  );
}
