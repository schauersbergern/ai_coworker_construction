import type { LocationProfile } from "../pipeline/profile";
import type { Scores } from "../scoring/score";

export interface NarrativeGenerator {
  generate(input: { systemPrompt: string; userContent: string }): Promise<string>;
}

export interface NarrativeInput {
  profile: LocationProfile;
  scores: Scores;
  systemPrompt: string;
}

/** Serialisiert nur belastbare (ok) Felder als Werte; unavailable/error nur als {status,reason},
 *  damit das LLM nichts erfindet. */
export function serializeForLlm(profile: LocationProfile, scores: Scores): string {
  const fields = Object.fromEntries(
    Object.entries(profile.fields).map(([k, dp]) => [
      k,
      dp.status === "ok" ? dp.value : { status: dp.status, reason: dp.reason },
    ]),
  );
  return JSON.stringify({ coordinate: profile.coordinate, scores, fields }, null, 2);
}

export async function buildNarrative(
  input: NarrativeInput,
  gen: NarrativeGenerator,
): Promise<string> {
  return gen.generate({
    systemPrompt: input.systemPrompt,
    userContent: serializeForLlm(input.profile, input.scores),
  });
}
