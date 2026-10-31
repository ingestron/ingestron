// A fix edit that removes a key or list item with its value, and any mapping
// or list the removal leaves empty (specification section 6.1).

import { isMap, isScalar, isSeq, type Pair, type YAMLMap, type YAMLSeq } from "yaml";

type Collection = YAMLMap | YAMLSeq;
type Change = { start: number; end: number; text: string };

/** One step down the pointer: the collection, and the entry in it. */
interface Step {
  collection: Collection;
  entry: Pair | unknown;
}

/** The change that removes what `keys` names in `root`, or undefined when nothing is there. */
export function removal(root: unknown, keys: string[], text: string): Change | undefined {
  const steps = stepsTo(root, keys);
  if (!steps) return undefined;
  // An entry that is the last in its collection takes the collection with it.
  let at = steps.length - 1;
  while (at > 0 && steps[at]!.collection.items.length === 1) at -= 1;
  const { collection, entry } = steps[at]!;
  const range = rangeOf(entry);
  if (!range) return undefined;
  return collection.flow ? fromFlow(range, text) : fromBlock(range, text);
}

function stepsTo(root: unknown, keys: string[]): Step[] | undefined {
  const steps: Step[] = [];
  let node = root;
  for (const key of keys) {
    if (isMap(node)) {
      const pair = node.items.find(
        (item) => String(isScalar(item.key) ? item.key.value : item.key) === key,
      );
      if (!pair) return undefined;
      steps.push({ collection: node, entry: pair });
      node = pair.value;
    } else if (isSeq(node) && /^\d+$/.test(key) && node.items[Number(key)] !== undefined) {
      const item = node.items[Number(key)];
      steps.push({ collection: node, entry: item });
      node = item;
    } else return undefined;
  }
  return steps.length > 0 ? steps : undefined;
}

/** From a pair's key, or an item, to the end of its value. */
function rangeOf(entry: unknown): [number, number] | undefined {
  const pair = entry as Pair<{ range?: number[] } | null, { range?: number[] } | null>;
  const node = (isPairLike(entry) ? pair.key : entry) as { range?: number[] } | null;
  const last = (isPairLike(entry) ? (pair.value ?? pair.key) : entry) as {
    range?: number[];
  } | null;
  const start = node?.range?.[0];
  const end = last?.range?.[1];
  return start === undefined || end === undefined ? undefined : [start, end];
}

function isPairLike(entry: unknown): boolean {
  return typeof entry === "object" && entry !== null && "key" in entry && "value" in entry;
}

/** Every line from the entry's first to the last line of its value. */
function fromBlock([start, end]: [number, number], text: string): Change {
  let last = end;
  while (last > start && /\s/.test(text[last - 1] ?? "")) last -= 1;
  const lineEnd = text.indexOf("\n", last);
  return {
    start: text.lastIndexOf("\n", start - 1) + 1,
    end: lineEnd === -1 ? text.length : lineEnd + 1,
    text: "",
  };
}

/** The entry and the comma after it, else the comma before it. */
function fromFlow([start, end]: [number, number], text: string): Change {
  const after = /^\s*,\s*/.exec(text.slice(end));
  if (after) return { start, end: end + after[0].length, text: "" };
  const before = /\s*,\s*$/.exec(text.slice(0, start));
  return { start: before ? start - before[0].length : start, end, text: "" };
}
