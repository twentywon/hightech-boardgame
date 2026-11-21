import { getAIOptions, setAIOptions } from "../../core/storage";
import type { AIOptions } from "../../core/ai";
export const OPTIONS_KEY = "wtg.reversi.ai.v1";
export const getOptions = () => getAIOptions(OPTIONS_KEY);
export const setOptions = (options: AIOptions) =>
  setAIOptions(options, OPTIONS_KEY);
