import { search } from "./ai";
import type { State } from "./rules";
import type { Difficulty } from "../../core/ai";
self.onmessage = (
  event: MessageEvent<{ state: State; difficulty: Difficulty; seed: number }>,
) => {
  try {
    self.postMessage({
      result: search(event.data.state, event.data.difficulty, { seed: event.data.seed }),
    });
  } catch {
    self.postMessage({ error: "장기 AI 계산에 실패했습니다. 다시 시도해 주세요." });
  }
};
