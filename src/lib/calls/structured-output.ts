const interestLevels = new Set(["high", "medium", "low", "none"]);

export type StructuredCallFields = {
  interested: boolean | null;
  interest_level: "high" | "medium" | "low" | "none" | null;
  callback_requested: boolean | null;
  callback_time: string | null;
  do_not_call: boolean | null;
  notes: string | null;
};

const emptyFields: StructuredCallFields = {
  interested: null,
  interest_level: null,
  callback_requested: null,
  callback_time: null,
  do_not_call: null,
  notes: null,
};

function objectValue(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function booleanValue(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function textValue(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 4000) : null;
}

export function fieldsFromRecord(value: unknown): StructuredCallFields {
  const record = objectValue(value);
  if (!record) return { ...emptyFields };
  const level = record.interest_level;
  return {
    interested: booleanValue(record.interested),
    interest_level:
      typeof level === "string" && interestLevels.has(level)
        ? (level as StructuredCallFields["interest_level"])
        : null,
    callback_requested: booleanValue(record.callback_requested),
    callback_time: textValue(record.callback_time ?? record.callback_at),
    do_not_call: booleanValue(record.do_not_call),
    notes: textValue(record.notes),
  };
}

function hasField(fields: StructuredCallFields) {
  return Object.values(fields).some((value) => value != null);
}

function mergeFields(base: StructuredCallFields, extra: StructuredCallFields) {
  const next = { ...base };
  (Object.keys(next) as (keyof StructuredCallFields)[]).forEach((key) => {
    if (next[key] == null && extra[key] != null) next[key] = extra[key] as never;
  });
  return next;
}

function outputResults(value: unknown) {
  const record = objectValue(value);
  if (!record) return [];
  return Object.values(record).map((entry) => {
    const output = objectValue(entry);
    const result = output?.result ?? entry;
    const name = typeof output?.name === "string" ? output.name : "";
    return { name, fields: fieldsFromRecord(result) };
  });
}

export function compactStructuredFields(fields: StructuredCallFields) {
  const copy: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value != null) copy[key] = value;
  }
  return Object.keys(copy).length > 0 ? copy : undefined;
}

export function extractStructuredFields(source: unknown): StructuredCallFields {
  const root = objectValue(source) ?? {};
  const message = objectValue(root.message) ?? root;
  const call = objectValue(message.call);
  const analysis = objectValue(message.analysis) ?? objectValue(call?.analysis);
  const artifact = objectValue(message.artifact) ?? objectValue(call?.artifact);

  let fields = fieldsFromRecord(analysis?.structuredData);
  const outputs = [
    ...outputResults(artifact?.structuredOutputs),
    ...outputResults(call?.artifact && objectValue(call.artifact)?.structuredOutputs),
  ];
  const preferred = outputs.filter((output) => /outcome|interest|lead|analysis/i.test(output.name));
  const ordered = preferred.length > 0 ? [...preferred, ...outputs] : outputs;
  for (const output of ordered) {
    if (hasField(output.fields)) fields = mergeFields(fields, output.fields);
  }
  return fields;
}
