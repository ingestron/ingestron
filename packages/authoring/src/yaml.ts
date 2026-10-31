// Positions in YAML text: what is at an offset, where a pointer is, and which
// mapping a key being typed belongs to. Every function tolerates syntax
// errors, because the user is in the middle of typing.
import { isMap, isScalar, isSeq, parseDocument, type Node, type Pair } from "yaml";

/** A key or value at an offset. */
export interface Spot {
  /** JSON Pointer of the value (also for a key: the pointer of its value). */
  pointer: string;
  segments: string[];
  part: "key" | "value";
  /** The scalar's text; empty for a mapping or list. */
  text: string;
  range: [number, number];
}

/** A zero-based line and character. */
export interface Position {
  line: number;
  character: number;
}

const pointerOf = (segments: string[]) =>
  segments.map((segment) => `/${segment.replaceAll("~", "~0").replaceAll("/", "~1")}`).join("");

/** The deepest key or value at the offset, if any. */
export function spotAt(text: string, offset: number): Spot | undefined {
  const document = parseDocument(text);
  return document.contents ? visit(document.contents, [], offset) : undefined;
}

function visit(node: Node, segments: string[], offset: number): Spot | undefined {
  if (isMap(node)) return inMap(node.items as Pair<Node, Node>[], segments, offset);
  if (isSeq(node)) return inSeq(node.items as Node[], segments, offset);
  if (isScalar(node) && node.range && within(node.range, offset))
    return spot(segments, "value", String(node.value ?? ""), node.range);
  return undefined;
}

function inMap(pairs: Pair<Node, Node>[], segments: string[], offset: number): Spot | undefined {
  for (const pair of pairs) {
    const found = inPair(pair, segments, offset);
    if (found) return found;
  }
  return undefined;
}

function inSeq(items: Node[], segments: string[], offset: number): Spot | undefined {
  for (const [index, item] of items.entries()) {
    if (item?.range && within(item.range, offset))
      return visit(item, [...segments, String(index)], offset);
  }
  return undefined;
}

function inPair(pair: Pair<Node, Node>, segments: string[], offset: number): Spot | undefined {
  const key = pair.key;
  const name = isScalar(key) ? String(key.value) : "";
  if (key?.range && within(key.range, offset))
    return spot([...segments, name], "key", name, key.range);
  const value = pair.value;
  if (value?.range && within(value.range, offset)) return visit(value, [...segments, name], offset);
  return undefined;
}

function within(range: [number, number, number], offset: number): boolean {
  return offset >= range[0] && offset <= range[1];
}

function spot(
  segments: string[],
  part: Spot["part"],
  text: string,
  range: [number, number, number],
): Spot {
  return { pointer: pointerOf(segments), segments, part, text, range: [range[0], range[1]] };
}

/** The range of the value (or key) at a pointer. */
export function rangeOf(
  text: string,
  pointer: string,
  part: Spot["part"] = "value",
): [number, number] | undefined {
  const segments = segmentsOf(pointer);
  let node: unknown = parseDocument(text).contents;
  for (const [index, segment] of segments.entries()) {
    const pair = isMap(node) ? pairOf(node.items as Pair<Node, Node>[], segment) : undefined;
    if (pair && index === segments.length - 1 && part === "key") return rangeOfNode(pair.key);
    node = pair ? pair.value : isSeq(node) ? node.items[Number(segment)] : undefined;
    if (node === undefined) return undefined;
  }
  return rangeOfNode(node as Node | null);
}

function segmentsOf(pointer: string): string[] {
  return pointer
    .split("/")
    .slice(1)
    .map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"));
}

function pairOf(pairs: Pair<Node, Node>[], key: string): Pair<Node, Node> | undefined {
  return pairs.find((item) => isScalar(item.key) && String(item.key.value) === key);
}

function rangeOfNode(node: Node | null | undefined): [number, number] | undefined {
  return node?.range ? [node.range[0], node.range[1]] : undefined;
}

/**
 * The keys of the mapping a key typed at this offset belongs to, from the
 * indentation of the lines above; works on text that does not parse yet.
 */
export function keyPath(text: string, offset: number): string[] {
  const lines = text.slice(0, offset).split("\n");
  let indent = (lines.at(-1) ?? "").search(/\S|$/);
  const path: string[] = [];
  for (let at = lines.length - 2; at >= 0; at -= 1) {
    const step = parentStep(lines[at]!, indent);
    if (!step) continue;
    const index = String(itemIndex(lines, at));
    path.unshift(...step.keys.map((key) => (key === "0" ? index : key)));
    indent = step.indent;
    if (indent === 0) break;
  }
  return path;
}

/** Which item of its list the dash on line `at` starts: the dashes above it at the same indentation. */
export function itemIndex(lines: string[], at: number): number {
  const dash = /^(\s*)-(\s|$)/.exec(lines[at] ?? "")?.[1]?.length;
  if (dash === undefined) return 0;
  let count = 0;
  for (let above = at - 1; above >= 0; above -= 1) {
    const line = lines[above]!;
    if (line.trim() === "") continue;
    const indent = line.search(/\S/);
    if (indent < dash) break;
    if (indent === dash && /^\s*-(\s|$)/.test(line)) count += 1;
  }
  return count;
}

/**
 * What a line above adds to the path of a place at `indent`: a key whose
 * mapping holds it, a list item (`0`) that holds it, or both for `- key:`.
 */
function parentStep(line: string, indent: number): { keys: string[]; indent: number } | undefined {
  const shape = shapeOf(line);
  if (!shape || shape.at >= indent) return undefined;
  const { at, item, opens, content } = shape;
  // A key with no value on its line holds a mapping below it.
  if (opens && (!item || content < indent))
    return { keys: item ? ["0", opens] : [opens], indent: at };
  return item ? { keys: ["0"], indent: at } : undefined;
}

/** A line's indentation, whether it starts a list item, and the key it opens with no value. */
function shapeOf(line: string) {
  const match = /^(\s*)(-\s+)?(?:([\w.-]+):\s*(#.*)?|([\w.-]+):\s*\S.*|-?\s*)$/.exec(line);
  if (!match) return undefined;
  const at = match[1]!.length;
  const dash = match[2]?.length ?? 0;
  return {
    at,
    item: dash > 0 || /^\s*-\s*$/.test(line),
    opens: match[3],
    content: at + dash,
  };
}

/** The line and character of an offset. */
export function positionAt(text: string, offset: number): Position {
  const before = text.slice(0, offset).split("\n");
  return { line: before.length - 1, character: before.at(-1)!.length };
}

/** The offset of a line and character. */
export function offsetAt(text: string, position: Position): number {
  const lines = text.split("\n");
  const start = lines.slice(0, position.line).reduce((sum, line) => sum + line.length + 1, 0);
  return start + position.character;
}

/** Every key and scalar value in the text, with pointers and ranges. */
export function allSpots(text: string): Spot[] {
  const found: Spot[] = [];
  const contents = parseDocument(text).contents;
  if (contents) collect(contents, [], found);
  return found;
}

function collect(node: Node, segments: string[], found: Spot[]): void {
  if (isMap(node)) collectPairs(node.items as Pair<Node, Node>[], segments, found);
  else if (isSeq(node))
    (node.items as Node[]).forEach(
      (item, index) => item && collect(item, [...segments, String(index)], found),
    );
  else if (isScalar(node) && node.range)
    found.push(spot(segments, "value", String(node.value ?? ""), node.range));
}

function collectPairs(pairs: Pair<Node, Node>[], segments: string[], found: Spot[]): void {
  for (const pair of pairs) {
    const name = isScalar(pair.key) ? String(pair.key.value) : "";
    if (pair.key?.range) found.push(spot([...segments, name], "key", name, pair.key.range));
    if (pair.value) collect(pair.value, [...segments, name], found);
  }
}
