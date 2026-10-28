"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type VariableRow = {
  key: string;
  value: string;
};

export function VariableFields({ initialRows }: { initialRows: VariableRow[] }) {
  const [rows, setRows] = useState(() => {
    const source = initialRows.length > 0 ? initialRows : [{ key: "", value: "" }];
    return source.map((row, index) => ({ ...row, id: `variable-${index}` }));
  });

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-sm font-medium">Prompt variables</legend>
      <p className="text-sm text-muted-foreground">
        These values are injected into the Vapi assistant prompt variables.
      </p>
      <input
        type="hidden"
        name="variablesJson"
        value={JSON.stringify(rows.map(({ key, value }) => ({ key, value })))}
      />
      {rows.map((row, index) => (
        <div key={row.id} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <Input
            aria-label={`Variable ${index + 1} name`}
            value={row.key}
            placeholder="services_summary"
            className="h-10"
            onChange={(event) => {
              const key = event.target.value;
              setRows((current) => current.map((item) => (item.id === row.id ? { ...item, key } : item)));
            }}
          />
          <Input
            aria-label={`Variable ${index + 1} value`}
            value={row.value}
            placeholder="Maths and science, grades 6–12"
            className="h-10"
            onChange={(event) => {
              const value = event.target.value;
              setRows((current) =>
                current.map((item) => (item.id === row.id ? { ...item, value } : item)),
              );
            }}
          />
          <Button
            type="button"
            variant="outline"
            className="h-10"
            onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))}
          >
            Remove
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        className="w-fit"
        onClick={() =>
          setRows((current) => [...current, { id: `variable-${current.length}-${Date.now()}`, key: "", value: "" }])
        }
      >
        Add variable
      </Button>
    </fieldset>
  );
}
