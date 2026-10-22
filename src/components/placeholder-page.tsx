export function PlaceholderPage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-2">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="max-w-xl text-sm text-muted-foreground">{description}</p>
    </section>
  );
}
