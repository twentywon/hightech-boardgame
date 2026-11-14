import type { Difficulty } from "../core/ai";
export interface WorkerPort {
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror?: ((event: MessageEvent) => void) | null;
  postMessage(data: unknown): void;
  terminate(): void;
}
export class WorkerClient<S, R> {
  private worker: WorkerPort | null = null;
  private generation = 0;
  private reject: ((reason: Error) => void) | null = null;
  private watchdog: ReturnType<typeof setTimeout> | null = null;
  constructor(
    private factory: () => WorkerPort,
    private budget: (difficulty: Difficulty) => number,
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
  async compute(state: S, difficulty: Difficulty, seed = 1): Promise<R> {
    this.cancel();
    const generation = this.generation;
    return new Promise((resolve, reject) => {
      this.reject = reject;
      let settled = false;
      const finish = () => {
        settled = true;
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
          if (settled || generation !== this.generation) return;
          finish();
          if (!event.data || typeof event.data !== "object")
            reject(new Error("AI 응답을 읽을 수 없습니다. 다시 시도해 주세요."));
          else if (event.data.error) reject(new Error(event.data.error));
          else if (event.data.result == null)
            reject(new Error("AI 응답을 읽을 수 없습니다. 다시 시도해 주세요."));
          else resolve(event.data.result);
        };
        worker.onmessageerror = () => {
          if (settled || generation !== this.generation) return;
          finish();
          reject(new Error("AI 응답을 읽을 수 없습니다. 다시 시도해 주세요."));
        };
        worker.onerror = () => {
          if (settled || generation !== this.generation) return;
          finish();
          reject(
            new Error(
              "AI Worker를 시작할 수 없습니다. 페이지를 새로고침하거나 다시 시도해 주세요.",
            ),
          );
        };
        // A failed Worker must not leave the UI thinking forever. No main-thread search fallback.
        this.watchdog = setTimeout(
          () => {
            if (generation !== this.generation) return;
            finish();
            reject(
              new Error("AI 응답 시간이 초과되었습니다. 다시 시도해 주세요."),
            );
          },
          this.budget(difficulty) + 5000,
        );
        worker.postMessage({ state, difficulty, seed });
      } catch (error) {
        finish();
        reject(error);
      }
    });
  }
}
