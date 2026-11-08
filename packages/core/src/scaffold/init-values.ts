// The named values of a new project: each REPLACE_ME, secret and connection setting, where
// it is written and the comment above it, for `--set` and README.md (spec/cli/projects.md,
// "Names and --set").
import { isMap, isScalar, isSeq, LineCounter, parseDocument, type Node } from "yaml";
import { replaceMe } from "./init-yaml.js";
import type { Content } from "./scaffold.js";

/** One named value, where it is written. */
export interface ProjectValue {
  name: string;
  file: string;
  keys: string[];
  line: number;
  /** The environment whose `environments.<name>.values` holds it; absent when written once. */
  environment?: string;
  /** `replace` for REPLACE_ME, `secret` for a `${secret:…}`, `setting` for any other. */
  kind: "replace" | "secret" | "setting";
  value: unknown;
  /** The comment line directly above it, without `#`. */
  comment?: string;
}

const secret = /^\$\{secret:([^}]+)\}$/;

/** Every named value of the files, in path order and the order written. */
export function projectValues(files: Record<string, Content>): ProjectValue[] {
  return Object.keys(files)
    .filter((path) => /\.ya?ml$/.test(path))
    .sort()
    .flatMap((path) => valuesIn(path, String(files[path])));
}

function valuesIn(file: string, text: string): ProjectValue[] {
  const lines = new LineCounter();
  const document = parseDocument(text, { lineCounter: lines });
  const kind = document.get("kind");
  const rows = text.split(/\r?\n/);
  const found: ProjectValue[] = [];
  visit(document.contents, [], (keys, node) => {
    const value = node.value;
    const named = nameOf(file, kind, keys);
    const type = kindOf(value, named);
    if (!type || !named) return;
    const { line } = lines.linePos(node.range?.[0] ?? 0);
    const above = rows[line - 2]?.trim();
    found.push({
      name: named.name,
      file,
      keys,
      line,
      ...(named.environment && { environment: named.environment }),
      kind: type,
      value,
      ...(above?.startsWith("#") && { comment: above.replace(/^#+\s*/, "") }),
    });
  });
  return found;
}

function kindOf(value: unknown, named: Named | undefined): ProjectValue["kind"] | undefined {
  if (typeof value === "string" && value.includes(replaceMe)) return "replace";
  if (typeof value === "string" && secret.test(value)) return "secret";
  return named?.setting ? "setting" : undefined;
}

interface Named {
  name: string;
  environment?: string;
  /** Settable with `--set` even when it holds neither REPLACE_ME nor a secret. */
  setting?: boolean;
}

/** The name of the value at `keys`, by the table in spec/cli/projects.md. */
function nameOf(file: string, kind: unknown, keys: string[]): Named | undefined {
  if (file === "project.yaml") return projectName(keys);
  const path = keys.join(".");
  const last = keys.at(-1) ?? "";
  const rule = rules.find((item) => item.kind === kind && item.test(keys, path));
  if (rule) return rule.name(keys);
  return /^\d+$/.test(last) ? { name: keys.at(-2) ?? last } : { name: last };
}

/** Where a document's value is, and the name it has there. */
const rules: {
  kind: string;
  test: (keys: string[], path: string) => boolean;
  name: (keys: string[]) => Named;
}[] = [
  {
    kind: "Connection",
    test: (keys) => keys[0] === "settings" && keys.length === 2,
    name: (keys) => ({ name: `source_${keys[1]}`, setting: true }),
  },
  {
    kind: "Flow",
    test: (keys) => keys[0] === "tables" && keys.length === 3 && keys[2] === "object",
    name: (keys) => ({ name: `${keys[1]}_object` }),
  },
  {
    kind: "Flow",
    test: (_, path) => path === "ingest.with.query",
    name: () => ({ name: "source_query" }),
  },
  {
    kind: "Flow",
    test: (keys, path) => path.startsWith("ingest.with.source_options.") && keys.length === 4,
    name: (keys) => ({ name: `option_${keys[3]}` }),
  },
  {
    kind: "Platform",
    test: (keys) => keys[0] === "settings" && keys.length === 3,
    name: (keys) => ({ name: keys[2]! }),
  },
];

function projectName(keys: string[]): Named | undefined {
  if (keys[0] === "values" && keys.length === 2) return { name: keys[1]!, setting: true };
  if (keys[0] === "environments" && keys[2] === "values" && keys.length === 4)
    return { name: keys[3]!, environment: keys[1]!, setting: true };
  return undefined;
}

function visit(
  node: unknown,
  keys: string[],
  found: (keys: string[], node: { value: unknown; range?: number[] | null }) => void,
): void {
  if (isMap(node))
    for (const pair of node.items) {
      const key = String(isScalar(pair.key) ? pair.key.value : pair.key);
      visit(pair.value, [...keys, key], found);
    }
  else if (isSeq(node))
    node.items.forEach((item, index) => visit(item as Node, [...keys, String(index)], found));
  else if (isScalar(node)) found(keys, node as { value: unknown; range?: number[] | null });
}
