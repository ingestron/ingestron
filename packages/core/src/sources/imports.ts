// Adding the metadata document to `project.yaml`'s imports (spec/cli/sources.md, section 3, "The
// project's imports"). The list is found with the yaml Document API and the path is written into
// the text itself, so every other line, comment and quote stays as it was.
import { matchesImport } from "@ingestron/config/core";
import { isMap, isScalar, isSeq, parseDocument, type Document, type YAMLSeq } from "yaml";
import { yamlText } from "./yaml-value.js";

/** The text with `insert` placed at `at`. */
function spliced(text: string, at: number, insert: string): string {
  return `${text.slice(0, at)}${insert}${text.slice(at)}`;
}

/** A flow list, `[a, b]`, with `, <path>` after its last item, or the path inside `[]`. */
function inFlowList(text: string, list: YAMLSeq, path: string): string | undefined {
  const last = list.items.at(-1);
  const value = yamlText(path, "flow");
  if (isScalar(last) && last.range) return spliced(text, last.range[1], `, ${value}`);
  const end = list.range?.[1];
  if (list.items.length > 0 || end === undefined || text[end - 1] !== "]") return undefined;
  return spliced(text, end - 1, value);
}

/** A block list with `- <path>` on a new line after its last item, at the same indent. */
function inBlockList(text: string, list: YAMLSeq, path: string): string | undefined {
  const last = list.items.at(-1);
  if (!isScalar(last) || !last.range) return undefined;
  const lineStart = text.lastIndexOf("\n", last.range[0]) + 1;
  const indent = /^([ \t]*)- /.exec(text.slice(lineStart))?.[1];
  if (indent === undefined) return undefined;
  const newline = text.indexOf("\n", last.range[1]);
  const lineEnd = newline === -1 ? text.length : newline - (text[newline - 1] === "\r" ? 1 : 0);
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  return spliced(text, lineEnd, `${eol}${indent}- ${yamlText(path, "block")}`);
}

/** Through the Document API, when the text cannot be edited in place: `imports` set to a new list. */
function withNewList(document: Document.Parsed, path: string): string {
  const list = document.get("imports", true);
  if (isSeq(list)) list.add(document.createNode(path));
  else document.set("imports", document.createNode([path]));
  return document.toString({ lineWidth: 0 });
}

/**
 * `project.yaml`'s text with the metadata document's path added at the end of `imports`, or
 * undefined when an import already matches the path (`matchesImport`). The document's own path is
 * added, not a pattern, so that no other file in `sources/` is loaded as a definition. The rest
 * of the text, its comments and layout, is kept as it was.
 * @example withSourcesImport("imports:\n  - flows/*.yaml\n", "sources/erp.yaml") // "imports:\n  - flows/*.yaml\n  - sources/erp.yaml\n"
 * @public
 */
export function withSourcesImport(projectYaml: string, documentPath: string): string | undefined {
  const document = parseDocument(projectYaml);
  if (document.errors.length > 0) throw new Error("project.yaml is not valid YAML.");
  const list = isMap(document.contents) ? document.contents.get("imports", true) : undefined;
  if (!isSeq(list)) return withNewList(document, documentPath);
  const matches = list.items.some(
    (item) =>
      isScalar(item) && typeof item.value === "string" && matchesImport(item.value, documentPath),
  );
  if (matches) return undefined;
  const edited = list.flow
    ? inFlowList(projectYaml, list, documentPath)
    : inBlockList(projectYaml, list, documentPath);
  return edited ?? withNewList(document, documentPath);
}
