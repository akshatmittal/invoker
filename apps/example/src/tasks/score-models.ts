import { defineTask } from "@akshatmittal/invoker";

export const scoreModels = defineTask({
  name: "score-models",
  matrix: async () => ({
    model: ["baseline", "candidate"],
    dataset: ["support", "sales"],
  }),
  setup: ({ cases }) => ({
    caseCount: cases.length,
    scores: new Map([
      ["baseline:support", 0.84],
      ["baseline:sales", 0.79],
      ["candidate:support", 0.9],
      ["candidate:sales", 0.86],
    ]),
  }),
  run: ({ matrix, setup, vitest }) => {
    const score = setup.scores.get(`${matrix.model}:${matrix.dataset}`)!;
    const threshold = matrix.dataset === "support" ? 0.8 : 0.75;

    vitest.expect(setup.caseCount).toBe(4);
    if (process.env.INVOKER_EXAMPLE_FAILURE === "true" && matrix.model === "candidate") {
      vitest.expect(score, `simulated ${matrix.dataset} regression`).toBeLessThan(threshold);
    }
    vitest.expect(score).toBeGreaterThanOrEqual(threshold);

    return {
      model: matrix.model,
      dataset: matrix.dataset,
      score,
      threshold,
    };
  },
  teardown: ({ setup }) => {
    setup.scores.clear();
  },
});
