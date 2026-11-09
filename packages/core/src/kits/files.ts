// Reading the files of a kit folder: present, valid YAML, and the right shape.
import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

/**
 * A parsed YAML mapping.
 * @internal
 */
export type Data = Record<string, unknown>;

/** The files every kit folder holds. */
export const kitFiles = ["kit.yaml", "standard.yaml", "platform.yaml", "project.yaml", "README.md"];

/**
 * The text of a kit file; throws when it is missing or not a regular file.
 * @internal
 */
export function load(folder: string, name: string): string {
  const stat = lstatSync(join(folder, name), { throwIfNoEntry: false });
  if (!stat)
    throw new Error(
      `${name} is missing. A kit folder needs kit.yaml, standard.yaml, platform.yaml, project.yaml and README.md.`,
    );
  if (!stat.isFile())
    throw new Error(`${name} is not a regular file. Replace it with the file itself.`);
  return readFileSync(join(folder, name), "utf8");
}

/**
 * Parses YAML that must be a mapping; `examples` names keys for the message.
 * @internal
 */
export function mapping(text: string, name: string, examples: string): Data {
  let data: unknown;
  try {
    data = parse(text);
  } catch (error) {
    throw new Error(`${name} is not valid YAML: ${(error as Error).message.split("\n")[0]}`, {
      cause: error,
    });
  }
  if (typeof data !== "object" || data === null || Array.isArray(data))
    throw new Error(`${name}: it must be a list of keys and values, such as ${examples}.`);
  return data as Data;
}

/**
 * A key that must be text.
 * @internal
 */
export function text(data: Data, key: string): string {
  const value = data[key];
  if (typeof value !== "string") throw new Error(`kit.yaml: "${key}" must be text.`);
  return value;
}

/**
 * A key that must be a list of text; `hint` completes the message.
 * @internal
 */
export function list(data: Data, key: string, hint: string): string[] {
  const value = data[key];
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string"))
    throw new Error(`kit.yaml: "${key}" must be a list of ${hint}.`);
  return value as string[];
}
