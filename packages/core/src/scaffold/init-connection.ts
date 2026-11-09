// A connection's settings, by its connector's metadata: left out when optional, a secret by
// name, a default, a value to check, or REPLACE_ME (spec/cli/projects.md, "REPLACE_ME").
import type { Connector } from "@ingestron/definitions";
import { isMap, isScalar } from "yaml";
import {
  commentAfter,
  commentText,
  replaceMe,
  setWithComment,
  type YamlDocument,
} from "./init-yaml.js";

/** The end of the comment on a value kept from the example: README.md lists it to check. */
export const exampleValue = "the example's value, check it";

type Setting = Connector["settings"][number];

/** How a connectivity is reached, for the comment beside it. */
const reached: Record<string, string> = {
  private: "reached only through a self-hosted integration runtime or a private network",
  workspace: "reached from the workspace's own network",
  public: "reached over the internet",
};

/** The connection's settings: secrets by name, defaults, and REPLACE_ME for the rest. */
export function composeConnection(
  document: YamlDocument,
  connector: Connector | undefined,
  secretPrefix: string,
): void {
  const connectivity = String(document.get("connectivity"));
  if (reached[connectivity]) commentAfter(document, ["connectivity"], reached[connectivity]);
  const settings = document.get("settings");
  if (!isMap(settings)) return;
  for (const pair of [...settings.items]) {
    const key = String(isScalar(pair.key) ? pair.key.value : pair.key);
    const written = isScalar(pair.value) ? pair.value.value : undefined;
    const meta = connector?.settings.find((setting) => setting.name === key);
    composeSetting(document, key, written, meta, `${secretPrefix}-${key}`);
  }
}

function composeSetting(
  document: YamlDocument,
  key: string,
  written: unknown,
  meta: Setting | undefined,
  secret: string,
): void {
  // An optional setting is left out: the connector's default path does not need it.
  if (meta?.optional) {
    document.deleteIn(["settings", key]);
    return;
  }
  const value = settingValue(written, meta, secret);
  // A value kept from the example, not a default, says so: nothing else would flag it.
  const example = value === written && meta?.default === undefined && !isReference(written);
  const comment = meta ? describe(meta, value, example) : undefined;
  setWithComment(document, ["settings", key], value, comment);
}

/** A setting's value by its metadata: a secret, a default, or REPLACE_ME. */
function settingValue(written: unknown, meta: Setting | undefined, secret: string): unknown {
  if (meta?.secret || isSecret(written)) return secretReference(secret);
  if (meta?.default !== undefined) return meta.default;
  return kept(written, meta) ? written : replaceMe;
}

/**
 * Without a default in the metadata, the example's value stays where it is one of a kind
 * (a number, true or false, or one of the allowed values), or where it says what to write:
 * a value read from project.yaml, or one already REPLACE_ME.
 */
function kept(written: unknown, meta: Setting | undefined): boolean {
  if (typeof written !== "string") return true;
  if (meta?.values?.includes(written)) return true;
  return isReference(written);
}

/** A `${secret:…}` reference. */
export function isSecret(value: unknown): boolean {
  return typeof value === "string" && value.startsWith("${secret:");
}

/** `${secret:<name>}`, each `_` written `-`. */
export function secretReference(name: string): string {
  return `\${secret:${name.replaceAll("_", "-")}}`;
}

function describe(meta: Setting, value: unknown, example: boolean): string {
  const text = commentText(meta.description);
  if (isSecret(value) && !/Key Vault/i.test(text))
    return commentText(`Key Vault secret: ${lowerFirst(text)}`);
  return example ? `${text.slice(0, 98 - exampleValue.length - 2)}; ${exampleValue}` : text;
}

/** The first letter in lower case, unless the word is an initialism, such as PEM. */
function lowerFirst(text: string): string {
  return /^[A-Z][a-z]/.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

/** Text that reads another value, or is already REPLACE_ME: the example says what to write. */
function isReference(value: unknown): boolean {
  return typeof value === "string" && (value.includes("${") || value.includes(replaceMe));
}
