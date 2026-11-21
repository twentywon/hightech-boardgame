import { searchSteps } from "./ai";
import type { State } from "./rules";
import type { Difficulty } from "../../core/ai";
self.onmessage = async (
  event: MessageEvent<{ state: State; difficulty: Difficulty; seed: number }>,
) => {
  try {
    const iterator = searchSteps(event.data.state, event.data.difficulty, {
      seed: event.data.seed,
    });
    let step = iterator.next();
    while (!step.done) {
      await new Promise((resolve) => setTimeout(resolve, 2));
      step = iterator.next();
    }
    self.postMessage({ result: step.value });
  } catch {
    self.postMessage({
      error: "리버시 AI 계산에 실패했습니다. 다시 시도해 주세요.",
    });
  }
};
