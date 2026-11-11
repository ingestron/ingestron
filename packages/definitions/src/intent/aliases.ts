// Method settings that are other names for intent (specification section 11.4).
import type { Intent } from "./vocabulary.js";

/**
 * A piece of intent, such as `{ history: none }`, that one value of a setting stands for.
 * @public
 */
export type IntentFragment = Intent;

/**
 * A method setting that is another name for intent: its value is the value at an intent
 * `path` (`sequence_by` is `sequence`), or each of its `values` stands for a piece of
 * intent (`mode: append` is `history: none`).
 * @public
 */
export type SettingAlias = { path: string } | { values: Record<string, IntentFragment> };
