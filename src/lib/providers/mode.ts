export type VoiceProviderMode = "mock" | "live";

export type ProviderEnv = {
  VOICE_PROVIDER_MODE?: string;
  VAPI_API_KEY?: string;
};

export function providerEnv(env?: ProviderEnv): ProviderEnv {
  if (env) return env;
  return {
    VOICE_PROVIDER_MODE: process.env.VOICE_PROVIDER_MODE,
    VAPI_API_KEY: process.env.VAPI_API_KEY,
  };
}

export function voiceProviderMode(env?: ProviderEnv): VoiceProviderMode {
  return providerEnv(env).VOICE_PROVIDER_MODE === "live" ? "live" : "mock";
}
