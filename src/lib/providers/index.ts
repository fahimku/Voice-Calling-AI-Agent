import { MockProvider } from "@/lib/providers/mock";
import { providerEnv, voiceProviderMode, type ProviderEnv } from "@/lib/providers/mode";
import type { VoiceProvider } from "@/lib/providers/types";
import { VapiProvider } from "@/lib/providers/vapi";

export function getVoiceProvider(env?: ProviderEnv): VoiceProvider {
  const resolved = providerEnv(env);
  if (voiceProviderMode(resolved) === "live") {
    const apiKey = resolved.VAPI_API_KEY?.trim();
    if (!apiKey) {
      throw new Error(
        "VOICE_PROVIDER_MODE is live, but VAPI_API_KEY is missing. Add it to .env.local.",
      );
    }
    return new VapiProvider(apiKey);
  }

  return new MockProvider();
}
