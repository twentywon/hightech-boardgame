import type { State } from "../rules";
import type { SearchResult } from "./search";
import { profiles } from "./difficulty";
import { WorkerClient, type WorkerPort } from "../../../engine/ai-client";
export type { WorkerPort } from "../../../engine/ai-client";
export class AIClient extends WorkerClient<State, SearchResult> {
  constructor(
    factory: () => WorkerPort = () =>
      new Worker(new URL("./worker.ts", import.meta.url), {
        type: "module",
      }) as unknown as WorkerPort,
  ) {
    super(factory, (d) => profiles[d].timeMs);
  }
}
