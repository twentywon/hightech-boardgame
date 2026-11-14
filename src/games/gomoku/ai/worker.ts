import { search } from "./search";
import type { State } from "../rules";
import type { Difficulty } from "./difficulty";
self.onmessage = (
  event: MessageEvent<{ state: State; difficulty: Difficulty; seed: number }>,
) => {
  try {
    self.postMessage({
      result: search(event.data.state, event.data.difficulty, {
        seed: event.data.seed,
      }),
    });
  } catch {
    self.postMessage({
      error: "AI 계산을 완료하지 못했습니다. 다시 시도해 주세요.",
    });
  }
};
