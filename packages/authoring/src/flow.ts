// The place inside `{ }` and `[ ]` written on one line, such as
// `- { metric: nullValues, mustBe: 0, | }`: which keys lead there, and
// whether a key, a value or a list item is being typed.

/** Keys inside the line's flow collections, and what is typed at the end. */
export interface FlowPlace {
  keys: string[];
  part: "key" | "value" | "item";
  /** A value typed straight after `key:`, with no space yet. */
  tight: boolean;
}

interface Frame {
  open: "{" | "[";
  /** The key this collection is the value of. */
  key?: string;
  /** Items before the current one. */
  count: number;
}

/** What starts a line before its flow collection: a list dash, a key, both or neither. */
export function lineStart(line: string): { item: boolean; key?: string; rest: string } | undefined {
  const start = /^(\s*)(-\s+)?(?:([\w.-]+):\s*)?(?=[{[])/.exec(line);
  if (!start) return undefined;
  return { item: start[2] !== undefined, key: start[3], rest: line.slice(start[0].length) };
}

/** The place at the end of `rest`, which starts with `{` or `[`; undefined once they close. */
export function flowPlace(rest: string): FlowPlace | undefined {
  const scan: Scan = { frames: [], token: "", quote: "" };
  for (const ch of rest) step(scan, ch);
  return scan.frames.length > 0 ? placeIn(scan.frames, scan.pending, rest) : undefined;
}

interface Scan {
  frames: Frame[];
  token: string;
  /** A key whose value is being written. */
  pending?: string;
  quote: string;
}

/** Reads one character: quotes, opening and closing brackets, keys and commas. */
function step(scan: Scan, ch: string): void {
  if (inQuote(scan, ch)) return;
  if (ch === ":" && scan.frames.at(-1)?.open === "{") return startValue(scan);
  if ("{[}],".includes(ch)) return structure(scan, ch);
  scan.token += ch;
}

/** Quoted text is skipped, so a comma or bracket inside quotes counts for nothing. */
function inQuote(scan: Scan, ch: string): boolean {
  if (!scan.quote && ch !== '"' && ch !== "'") return false;
  scan.quote = scan.quote === ch ? "" : scan.quote || ch;
  return true;
}

function startValue(scan: Scan): void {
  scan.pending = scan.token.trim();
  scan.token = "";
}

function structure(scan: Scan, ch: string): void {
  const top = scan.frames.at(-1);
  if (ch === "{" || ch === "[") scan.frames.push({ open: ch, key: scan.pending, count: 0 });
  else if (ch !== ",") scan.frames.pop();
  else if (top) top.count += 1;
  scan.pending = undefined;
  scan.token = "";
}

function placeIn(frames: Frame[], pending: string | undefined, rest: string): FlowPlace {
  const keys = frames.flatMap((frame, index) => [
    ...(frame.key ? [frame.key] : []),
    ...(frame.open === "[" && index < frames.length - 1 ? [String(frame.count)] : []),
  ]);
  const top = frames.at(-1)!;
  if (top.open === "[") return { keys, part: "item", tight: false };
  if (pending !== undefined)
    return { keys: [...keys, pending], part: "value", tight: /:\S*$/.test(rest) };
  return { keys, part: "key", tight: false };
}
