import { WorkerClient, type WorkerPort } from "../../engine/ai-client";
import { profiles, type SearchResult } from "./ai";
import type { State } from "./rules";
export class JanggiAIClient extends WorkerClient<State, SearchResult> {
  constructor(
    factory: () => WorkerPort = () =>
      new Worker(new URL("./worker.ts", import.meta.url), {
        type: "module",
      }) as unknown as WorkerPort,
  ) {
    super(factory, (d) => profiles[d].timeMs);
  }
}
