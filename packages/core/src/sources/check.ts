// What the rules of a recipe share: a checker that names the file in each message.

/** A parsed YAML mapping. */
export type Data = Record<string, unknown>;

/** True for a YAML mapping. */
export function isMapping(value: unknown): value is Data {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The value as a list, or an empty list when it is not one. */
export function listOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** The words of a list for a message: `a, b or c`. */
export function either(words: readonly string[]): string {
  return `${words.slice(0, -1).join(", ")} or ${words[words.length - 1]}`;
}

/** Fails with messages that start with the file's name. */
export class Checker {
  constructor(readonly file: string) {}

  fail(message: string): never {
    throw new Error(`${this.file}: ${message}`);
  }

  /** The file's name without a folder, as `id` must say. */
  get name(): string {
    return this.file.split(/[\\/]/).pop() ?? this.file;
  }

  mapping(value: unknown, path: string, example: string): Data {
    if (!isMapping(value))
      this.fail(`"${path}" must be a list of keys and values, such as ${example}.`);
    return value;
  }

  text(value: unknown, path: string): string {
    if (typeof value !== "string") this.fail(`"${path}" must be text.`);
    return value;
  }

  /** A required key of `data`; `path` is what comes before the key in the message. */
  required(data: Data, key: string, path: string): unknown {
    const value = data[key];
    if (value === undefined || value === null) this.fail(`"${path}${key}" is missing. Add it.`);
    return value;
  }

  oneOf<T extends string>(value: unknown, values: readonly T[], path: string): T {
    if (!values.includes(value as T))
      this.fail(`"${path}" must be ${values.length > 2 ? "one of " : ""}${either(values)}.`);
    return value as T;
  }

  unknownKey(data: Data, allowed: readonly string[], where?: string): void {
    const unknown = Object.keys(data).find((key) => !allowed.includes(key));
    if (unknown !== undefined)
      this.fail(
        `unknown key "${unknown}"${where ? ` in "${where}"` : ""}. Check its spelling or remove it.`,
      );
  }
}
