import { searchSteps } from "./ai";
import type { State } from "./rules";
import type { Difficulty } from "../../core/ai";
self.onmessage = async (
  e: MessageEvent<{ state: State; difficulty: Difficulty; seed: number }>,
) => {
  try {
    const iterator = searchSteps(e.data.state, e.data.difficulty, {
      seed: e.data.seed,
    });
    let step = iterator.next();
    while (!step.done) {
      await new Promise((r) => setTimeout(r, 2));
      step = iterator.next();
    }
    self.postMessage({ result: step.value });
  } catch {
    self.postMessage({
      error: "체스 AI 계산에 실패했습니다. 다시 시도해 주세요.",
    });
  }
};
