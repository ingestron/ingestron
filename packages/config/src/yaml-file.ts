// Parses one YAML file and answers "where in the file is this node?".

import {
  isAlias,
  isMap,
  isNode,
  isSeq,
  LineCounter,
  parseDocument,
  type Document,
  type Node,
} from "yaml";
import { error, type Diagnostic, type Location } from "./diagnostics.js";

/** A parsed YAML file together with what is needed to report locations. */
export interface YamlFile {
  path: string;
  document: Document.Parsed;
  lines: LineCounter;
}

/** True for paths the loader parses as YAML; other files are read as text. */
export function isYamlPath(path: string): boolean {
  return path.endsWith(".yaml") || path.endsWith(".yml");
}

/**
 * Parses YAML text. Syntax errors (including duplicate keys and more than one
 * document) are added to `diagnostics` and the result is `undefined`.
 */
export function parseYamlFile(
  path: string,
  text: string,
  diagnostics: Diagnostic[],
): YamlFile | undefined {
  const lines = new LineCounter();
  const document = parseDocument(text, {
    lineCounter: lines,
    prettyErrors: false,
    uniqueKeys: true,
  });
  const file: YamlFile = { path, document, lines };
  for (const problem of document.errors) {
    const location = offsetLocation(file, problem.pos[0]);
    diagnostics.push(
      error("YAML_SYNTAX", problem.message, location, referenceHint(text, location)),
    );
  }
  return document.errors.length > 0 ? undefined : file;
}

/** The location of a node, or of the file's start when there is no node. */
export function locationOf(file: YamlFile, node: Node | null | undefined): Location {
  return offsetLocation(file, node?.range?.[0] ?? 0);
}

function offsetLocation(file: YamlFile, offset: number): Location {
  const position = file.lines.linePos(offset);
  return { file: file.path, line: position.line, column: position.col };
}

/**
 * Follows pointer keys from the document root. Aliases are followed.
 * Returns `undefined` when a key does not exist.
 */
export function nodeAtKeys(file: YamlFile, keys: readonly string[]): Node | undefined {
  let node: unknown = file.document.contents;
  for (const key of keys) {
    node = childNode(node, key);
    if (isAlias(node)) node = node.resolve(file.document);
    if (!isNode(node)) return undefined;
  }
  return isNode(node) ? node : undefined;
}

function childNode(node: unknown, key: string): unknown {
  if (isMap(node)) return node.get(key, true);
  if (isSeq(node) && /^(0|[1-9]\d*)$/.test(key)) return node.get(Number(key), true);
  return undefined;
}

/** A reference written with a space after its colon, such as `${file: x}`, on the problem's line. */
function referenceHint(text: string, location: Location | undefined): string | undefined {
  const line = text.split("\n")[(location?.line ?? 1) - 1] ?? "";
  const written = /\$\{(\w+):\s+([^}]*)\}/.exec(line);
  return written
    ? `A reference has no space after its colon: write \${${written[1]}:${written[2]!.trim()}}.`
    : undefined;
}
