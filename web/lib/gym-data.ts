import { skillCount, type PublicSample, type RealmGym } from "./realms";

export type GymAttestations =
  | { network: "demo"; records: { reference: string; issuedAt: string; bot: string; score: number }[] }
  | { network: "mainnet-beta" | "devnet"; schema: string; records: { address: string }[] };

/** Only published examples for classes with authorized training tasks are available to bots. */
export function trainingExamples(gym: RealmGym) {
  return gym.skills
    .filter((s) => skillCount(s) > 0)
    .flatMap((s) => {
      const published: PublicSample[] = [
        { prompt: s.example ?? "", input: s.sampleInput },
        ...(s.additionalSamples ?? []),
      ];
      const samples =
        s.records ??
        published.map((sample, i) => ({
          ...sample,
          id: s.id + (i === 0 ? ".example" : `.example-${i + 1}`),
        }));
      return samples
        .filter((sample) => sample.prompt.trim())
        .map((sample) => ({
          ...sample,
          classId: s.id,
          className: s.name,
        }));
    });
}
