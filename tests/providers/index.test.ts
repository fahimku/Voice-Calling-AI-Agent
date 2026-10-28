import { describe, expect, it } from "vitest";

import { getVoiceProvider } from "@/lib/providers";
import { MockProvider } from "@/lib/providers/mock";
import { VapiProvider } from "@/lib/providers/vapi";

describe("getVoiceProvider", () => {
  it("defaults to mock and requires a key in live mode", () => {
    expect(getVoiceProvider({})).toBeInstanceOf(MockProvider);
    expect(getVoiceProvider({ VOICE_PROVIDER_MODE: "mock" })).toBeInstanceOf(MockProvider);
    expect(() => getVoiceProvider({ VOICE_PROVIDER_MODE: "live" })).toThrow(/VAPI_API_KEY/);
    expect(getVoiceProvider({ VOICE_PROVIDER_MODE: "live", VAPI_API_KEY: "test-key" })).toBeInstanceOf(
      VapiProvider,
    );
  });
});
