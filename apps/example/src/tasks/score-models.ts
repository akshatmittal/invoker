import { defineTask } from "@akshatmittal/invoker";

export const scoreModels = defineTask({
  name: "score-models",
  matrix: {
    model: ["baseline", "candidate"],
    dataset: ["support", "sales"],
  },
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
