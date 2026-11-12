// The order of a JSON record's keys as the file gives it. A JavaScript object lists integer-like keys
// (`2023`) first, in ascending order, whatever their place in the file, so a sample's reader takes
// the order from here.

const orders = new WeakMap<object, string[]>();

/** True for a key a JavaScript object would list ahead of the others. */
const reordered = (key: string): boolean =>
  /^(0|[1-9]\d{0,9})$/.test(key) && Number(key) < 2 ** 32 - 1;

/** The keys of a record, in the order the file that holds it gives them. */
export function keysOf(record: Record<string, unknown>): string[] {
  return orders.get(record) ?? Object.keys(record);
}

/** A parser of JSON text that is already known to be valid. */
class Reader {
  private at = 0;

  constructor(private readonly text: string) {}

  private skip(): void {
    while (" \t\n\r".includes(this.text[this.at] ?? "x")) this.at++;
  }

  /** The end of the string that starts at `at`, which is a quote. */
  private stringEnd(): number {
    let end = this.at + 1;
    while (this.text[end] !== '"') end += this.text[end] === "\\" ? 2 : 1;
    return end + 1;
  }

  private string(): string {
    const end = this.stringEnd();
    const value = JSON.parse(this.text.slice(this.at, end)) as string;
    this.at = end;
    return value;
  }

  private scalar(): unknown {
    const start = this.at;
    while (!",]} \t\n\r".includes(this.text[this.at] ?? ",")) this.at++;
    return JSON.parse(this.text.slice(start, this.at));
  }

  private list(): unknown[] {
    const items: unknown[] = [];
    this.at++;
    this.skip();
    if (this.text[this.at] === "]") return (this.at++, items);
    for (;;) {
      items.push(this.value());
      this.skip();
      if (this.text[this.at++] === "]") return items;
    }
  }

  private record(): Record<string, unknown> {
    const entries: [string, unknown][] = [];
    this.at++;
    this.skip();
    if (this.text[this.at] === "}") this.at++;
    else
      for (;;) {
        this.skip();
        const key = this.string();
        this.skip();
        this.at++;
        entries.push([key, this.value()]);
        this.skip();
        if (this.text[this.at++] === "}") break;
      }
    const record = Object.fromEntries(entries);
    const keys = [...new Set(entries.map(([key]) => key))];
    if (keys.some(reordered)) orders.set(record, keys);
    return record;
  }

  value(): unknown {
    this.skip();
    const char = this.text[this.at];
    if (char === "{") return this.record();
    if (char === "[") return this.list();
    return char === '"' ? this.string() : this.scalar();
  }
}

/** A key that a JavaScript object would list out of order, between quotes and before a colon. */
const mayReorder = /"(?:0|[1-9]\d{0,9})"\s*:/;

/**
 * The value of JSON text that is valid and has been parsed to `parsed`, with the order of every
 * record's integer-like keys kept for `keysOf`. The text is read again only when it may have such a
 * key,
 * and not when it is nested too deeply to walk.
 */
export function keepingOrder(text: string, parsed: unknown): unknown {
  if (!mayReorder.test(text)) return parsed;
  try {
    return new Reader(text).value();
  } catch (error) {
    // Text nested deeper than the stack can walk keeps the order JavaScript gives.
    if (error instanceof RangeError) return parsed;
    throw error;
  }
}
