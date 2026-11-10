import type { State } from "../rules";
import type { Difficulty } from "./difficulty";
import { profiles } from "./difficulty";
import type { SearchResult } from "./search";
export interface WorkerPort {
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(data: unknown): void;
  terminate(): void;
}
export class AIClient {
  private worker: WorkerPort | null = null;
  private generation = 0;
  private reject: ((reason: Error) => void) | null = null;
  private watchdog: ReturnType<typeof setTimeout> | null = null;
  constructor(
    private factory: () => WorkerPort = () =>
      new Worker(new URL("./worker.ts", import.meta.url), {
        type: "module",
      }) as unknown as WorkerPort,
  ) {}
  cancel() {
    this.generation++;
    this.worker?.terminate();
    this.worker = null;
    if (this.watchdog) clearTimeout(this.watchdog);
    this.watchdog = null;
    this.reject?.(new DOMException("AI request cancelled", "AbortError"));
    this.reject = null;
  }
  async compute(
    state: State,
    difficulty: Difficulty,
    seed = 1,
  ): Promise<SearchResult> {
    this.cancel();
    const generation = this.generation;
    return new Promise((resolve, reject) => {
      this.reject = reject;
      const finish = () => {
        this.worker?.terminate();
        this.worker = null;
        this.reject = null;
        if (this.watchdog) clearTimeout(this.watchdog);
        this.watchdog = null;
      };
      try {
        const worker = this.factory();
        this.worker = worker;
        worker.onmessage = (event) => {
          if (generation !== this.generation) return;
          finish();
          if (event.data.error) reject(new Error(event.data.error));
          else resolve(event.data.result);
        };
        worker.onerror = () => {
          if (generation !== this.generation) return;
          finish();
          reject(
            new Error(
              "AI Worker를 시작할 수 없습니다. 페이지를 새로고침하거나 다시 시도해 주세요.",
            ),
          );
        };
        // A failed Worker must not leave the UI thinking forever. No main-thread search fallback.
        this.watchdog = setTimeout(() => {
          if (generation !== this.generation) return;
          finish();
          reject(
            new Error("AI 응답 시간이 초과되었습니다. 다시 시도해 주세요."),
          );
        }, profiles[difficulty].timeMs + 5000);
        worker.postMessage({ state, difficulty, seed });
      } catch (error) {
        finish();
        reject(error);
      }
    });
  }
}
