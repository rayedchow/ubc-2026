/** One plain vocabulary for the whole app. */
export const t = {
  models: "Models",
  gyms: "Gyms",
  runs: "Runs",
  live: "Live",
  creator: "Creator",
  reps: "Graded rollouts",
  rep: "rollout",
  reward: "Mean reward",
  budget: "Budget",
  start: "Start run",
  stop: "Close and settle",
  hack: "Suspected reward hack",
  score: "Sealed-test score",
  attestation: "Improvement attestation",
  sealed: "TEE attested",
  sealedTest: "Run the sealed evaluation",
  royalty: "Creator royalty",
} as const;

/** Difficulty, stated as the pass-rate band of reference models. */
export const bandLabel = (band: [number, number]) => `Pass rate ${band[0]}–${band[1]}%`;
