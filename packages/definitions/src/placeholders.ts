// `{{ … }}` is replaced only in naming patterns and transform code; anywhere
// else in project.yaml or a document it stays as written, which is a warning
// with the `${…}` form as the fix (specification section 1).
import type { AnyDiagnostic, FileSource, Fix } from "@ingestron/config";
import { isMap, isScalar, isSeq, LineCounter, parseDocument, type Node } from "yaml";

/** `{{ … }}` names that have a `${…}` form outside naming patterns. */
const forms: Record<string, string> = {
  environment: "${environment.name}",
  env: "${environment.name}",
  project: "${project.id}",
};

const pattern = /\{\{\s*([\w.]*)\s*\}\}/g;

/** Warnings for `{{ … }}` that will not be replaced, in project.yaml and `files`. */
export function placeholderWarnings(source: FileSource, files: readonly string[]): AnyDiagnostic[] {
  return [...new Set(["project.yaml", ...files])].flatMap((file) => {
    const text = source.read(file);
    return text === undefined ? [] : inFile(file, text);
  });
}

function inFile(file: string, text: string): AnyDiagnostic[] {
  const lines = new LineCounter();
  const document = parseDocument(text, { lineCounter: lines });
  const kind = (document.toJS() as { kind?: unknown } | null)?.kind;
  if (kind === "DataContract" || !document.contents) return [];
  const found: AnyDiagnostic[] = [];
  walk(document.contents, [], (path, value, offset) => {
    if (!replaced(kind, path) && value.match(pattern))
      found.push(warning(file, path, value, lines.linePos(offset)));
  });
  return found;
}

/** Naming patterns and transform code replace `{{ … }}` themselves. */
function replaced(kind: unknown, [first]: string[]): boolean {
  if (kind === "Standard" || kind === "Platform") return first === "naming";
  return kind === "Transform" && first === "code";
}

function walk(
  node: Node,
  path: string[],
  visit: (path: string[], value: string, offset: number) => void,
): void {
  if (isMap(node))
    for (const pair of node.items) {
      const key = isScalar(pair.key) ? String(pair.key.value) : "";
      if (pair.value) walk(pair.value as Node, [...path, key], visit);
    }
  else if (isSeq(node))
    node.items.forEach(
      (item, index) => item && walk(item as Node, [...path, String(index)], visit),
    );
  else if (isScalar(node) && typeof node.value === "string" && node.range)
    visit(path, node.value, node.range[0]);
}

function warning(
  file: string,
  path: string[],
  value: string,
  { line, col }: { line: number; col: number },
): AnyDiagnostic {
  const names = [...value.matchAll(pattern)].map((match) => match[1]!);
  const convertible = names.every((name) => name in forms);
  const fixed = value.replace(pattern, (whole, name: string) => forms[name] ?? whole);
  const pointer = path.map((key) => `/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`).join("");
  const fixes: Fix[] = convertible
    ? [{ title: `Write ${fixed}`, edits: [{ file, pointer, set: fixed }] }]
    : [];
  return {
    code: "PLACEHOLDER_NOT_REPLACED",
    severity: "warning",
    message: `"${value}" stays as written: {{ }} is replaced only in naming patterns and transform code.`,
    hint: convertible
      ? `Write ${fixed}: \${…} references work in any value.`
      : "table, layer and source exist only in naming patterns; use ${values.…}, ${environment.name} or ${project.id} here.",
    location: { file, line, column: col },
    ...(fixes.length > 0 && { fixes }),
  };
}
