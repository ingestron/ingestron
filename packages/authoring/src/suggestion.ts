// One completion suggestion, as every completion source returns it.
import type { QuickFix } from "./fixes.js";

/** One suggestion. */
export interface Suggestion {
  label: string;
  kind: "field" | "value" | "reference" | "method" | "setting" | "document";
  detail?: string;
  documentation?: string;
  /** Text to insert, with tab stops, instead of the label. */
  snippet?: string;
  /** The likely choice, selected first. */
  preselect?: boolean;
  /** Plain text to insert instead of the label, such as the label after a space. */
  insertText?: string;
  /** The documentation page and anchor that explain it. */
  docs?: string;
  /** Offered straight after a list's `-`: insert after it rather than replace it. */
  afterDash?: boolean;
  /** Ask for suggestions again once inserted, such as the keys on a new line. */
  retrigger?: boolean;
  /** Edits to make once inserted, possibly in other files, such as declaring an input. */
  edits?: QuickFix["edits"];
}
