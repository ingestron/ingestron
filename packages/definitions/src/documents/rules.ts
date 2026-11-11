// A standard's method rules as written.
import type { History, LoadMode } from "../intent/index.js";

/** A `when` rule as written in a standard. */
export interface RuleDoc {
  connectivity?: string;
  connector?: string;
  input?: string;
  layer?: string;
  load?: LoadMode;
  history?: History;
  classification?: string;
  tag?: string;
  product?: string;
  domain?: string;
  use: string;
  with?: Record<string, unknown>;
}

/** Per-action rules as written in a standard. */
export interface RulesDoc {
  default?: string;
  allowed?: string[];
  when?: RuleDoc[];
  settings?: Record<string, Record<string, unknown>>;
  fixed?: Record<string, Record<string, unknown>>;
}
