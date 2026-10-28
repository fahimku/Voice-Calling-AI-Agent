const sampleRate = 8000;
const durationSeconds = 1;

export function placeholderWav() {
  const samples = sampleRate * durationSeconds;
  const dataBytes = samples * 2;
  const bytes = new Uint8Array(44 + dataBytes);
  const view = new DataView(bytes.buffer);
  const write = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) bytes[offset + index] = text.charCodeAt(index);
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, dataBytes, true);
  for (let index = 0; index < samples; index += 1) {
    const sample = Math.round(Math.sin((2 * Math.PI * 440 * index) / sampleRate) * 4000);
    view.setInt16(44 + index * 2, sample, true);
  }
  return bytes;
}

export function sliceAudio(bytes: Uint8Array, rangeHeader: string | null) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader ?? "");
  if (!match) {
    return { status: 200, body: bytes, contentRange: null as string | null };
  }
  const size = bytes.length;
  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) {
    return { status: 416, body: new Uint8Array(), contentRange: `bytes */${size}` };
  }
  const safeEnd = Math.min(end, size - 1);
  return {
    status: 206,
    body: bytes.slice(start, safeEnd + 1),
    contentRange: `bytes ${start}-${safeEnd}/${size}`,
  };
}

export function audioResponse(bytes: Uint8Array, rangeHeader: string | null) {
  const sliced = sliceAudio(bytes, rangeHeader);
  const headers = new Headers({
    "Content-Type": "audio/wav",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
  });
  if (sliced.contentRange) headers.set("Content-Range", sliced.contentRange);
  if (sliced.status !== 416) headers.set("Content-Length", String(sliced.body.byteLength));
  const copy = new ArrayBuffer(sliced.body.byteLength);
  new Uint8Array(copy).set(sliced.body);
  return new Response(copy, { status: sliced.status, headers });
}

export function providerCallIdFromRef(recordingRef: string | null, providerCallId: string | null) {
  if (!recordingRef || /^https?:/i.test(recordingRef)) return null;
  if (recordingRef.startsWith("vapi:")) {
    const id = recordingRef.slice(5);
    return /^[\w-]+$/.test(id) ? id : null;
  }
  return providerCallId && /^[\w-]+$/.test(providerCallId) ? providerCallId : null;
}

export async function handleRecordingRequest(input: {
  userId: string | null;
  call: { ownerId: string; recordingRef: string | null; providerCallId: string | null } | null;
  range: string | null;
  mode: "mock" | "live";
  fetchLive?: (providerCallId: string, range: string | null) => Promise<Response>;
}) {
  if (!input.userId) return Response.json({ error: "Unauthorized." }, { status: 401 });
  if (!input.call || input.call.ownerId !== input.userId) {
    return Response.json({ error: "Recording not found." }, { status: 404 });
  }
  const providerCallId = providerCallIdFromRef(input.call.recordingRef, input.call.providerCallId);
  if (!providerCallId) {
    const message = input.mode === "mock" ? "No recording in mock mode." : "No recording for this call.";
    return Response.json({ error: message }, { status: 404 });
  }
  if (input.mode === "mock" || providerCallId.startsWith("mock_")) {
    return audioResponse(placeholderWav(), input.range);
  }
  if (!input.fetchLive) return Response.json({ error: "No recording for this call." }, { status: 404 });
  return input.fetchLive(providerCallId, input.range);
}

export async function streamVapiMonoRecording(
  providerCallId: string,
  range: string | null,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
) {
  const listed = await fetchImpl(`https://api.vapi.ai/call/${encodeURIComponent(providerCallId)}/mono-recording`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    redirect: "manual",
  });
  const location = listed.headers.get("location");
  const source =
    listed.status >= 300 && listed.status < 400 && location?.startsWith("https://")
      ? await fetchImpl(location, { headers: range ? { Range: range } : {} })
      : listed;
  if (!source.ok && source.status !== 206) {
    return Response.json({ error: "No recording for this call." }, { status: 404 });
  }
  const headers = new Headers({
    "Content-Type": source.headers.get("content-type") ?? "audio/wav",
    "Cache-Control": "private, no-store",
    "Accept-Ranges": source.headers.get("accept-ranges") ?? "bytes",
  });
  const length = source.headers.get("content-length");
  const contentRange = source.headers.get("content-range");
  if (length) headers.set("Content-Length", length);
  if (contentRange) headers.set("Content-Range", contentRange);
  return new Response(source.body, { status: source.status, headers });
}
