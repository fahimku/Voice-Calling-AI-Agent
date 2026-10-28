function turns(transcript: string) {
  return transcript
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = /^(assistant|ai|customer|user)\s*:\s*(.*)$/i.exec(line);
      if (!match) return { role: "note" as const, text: line };
      const speaker = match[1]?.toLowerCase() ?? "";
      const customer = speaker === "customer" || speaker === "user";
      return { role: customer ? ("customer" as const) : ("assistant" as const), text: match[2] || line };
    });
}

export function TranscriptView({ transcript }: { transcript: string | null }) {
  if (!transcript) return <p className="text-sm text-muted-foreground">No transcript yet.</p>;
  return (
    <div className="flex flex-col gap-2">
      {turns(transcript).map((turn, index) => (
        <p
          key={`${index}-${turn.role}`}
          className={
            turn.role === "customer"
              ? "ml-8 rounded-lg bg-muted px-3 py-2 text-sm"
              : turn.role === "assistant"
                ? "mr-8 rounded-lg border px-3 py-2 text-sm"
                : "text-sm text-muted-foreground"
          }
        >
          {turn.role === "note" ? null : (
            <span className="mb-1 block text-xs text-muted-foreground">
              {turn.role === "customer" ? "Customer" : "Assistant"}
            </span>
          )}
          {turn.text}
        </p>
      ))}
    </div>
  );
}
