// Reading a source recipe: the rules of spec/cli/sources.md, section 1, checked in the order the
// specification gives them, stopping at the first that is broken.
import { parse } from "yaml";
import { Checker, isMapping, type Data } from "./check.js";
import type { SourceAsk, SourceReaderName, SourceRecipe, SourceTypeRule } from "./recipe.js";
import {
  checkAsk,
  checkId,
  checkInputNames,
  checkMatches,
  checkReaderKeys,
  checkSources,
} from "./rules.js";
import { askKeys, checkKeys, checkShapes } from "./shapes.js";

/** Rule 1: valid YAML, and a mapping. */
function parseMapping(text: string, check: Checker): Data {
  let data: unknown;
  try {
    data = parse(text);
  } catch (error) {
    return check.fail(`it is not valid YAML: ${(error as Error).message.split("\n")[0]}`);
  }
  if (!isMapping(data)) check.fail("it must be a list of keys and values, such as id: and kind:.");
  return data;
}

function askOf(data: Data): SourceAsk {
  const ask = data.ask as Data;
  const result: Data = {};
  for (const key of askKeys) if (ask[key] !== undefined) result[key] = ask[key];
  return result as unknown as SourceAsk;
}

/** The optional fields a recipe gives, copied. */
function optionalFields(data: Data): Partial<SourceRecipe> {
  const names = data.names as { parts: number; caseSensitive: boolean } | undefined;
  return {
    ...(names && { names: { parts: names.parts, caseSensitive: names.caseSensitive } }),
    ...(data.rows !== undefined && { rows: data.rows as string }),
    ...(data.fields !== undefined && { fields: { ...(data.fields as Data) } }),
    ...(data.key !== undefined && { key: [...(data.key as string[])] }),
    ...(data.columnNames !== undefined && {
      columnNames: {
        match: (data.columnNames as Data).match as string,
        to: (data.columnNames as Data).to as string,
      },
    }),
    ...(data.objects !== undefined && { objects: data.objects as "sets" | "types" }),
  };
}

/**
 * Reads and checks a source recipe; throws an Error naming `file` and the rule broken. The
 * rules are checked in the order of spec/cli/sources.md, section 1, and the first that is broken
 * is the one reported. `file` is where the text came from, such as `recipes/sqlserver.yaml`, and
 * its name without `.yaml` must be the recipe's `id`.
 * @public
 */
export function readSourceRecipe(text: string, file: string): SourceRecipe {
  const check = new Checker(file);
  const data = parseMapping(text, check);
  checkKeys(data, check);
  checkShapes(data, check);
  const id = checkId(data.id, check);
  const inputs = (data.inputs ?? {}) as Record<string, { description: string }>;
  checkInputNames(inputs, check);
  checkAsk(data.ask as Data, data.kind as string, check);
  checkReaderKeys(data, check);
  const types = (data.types ?? []) as SourceTypeRule[];
  checkMatches(types, data.columnNames as Data | undefined, check);
  const sources = checkSources(data.sources as unknown[], check);
  return {
    id,
    title: data.title as string,
    kind: data.kind as SourceRecipe["kind"],
    inputs: Object.fromEntries(
      Object.entries(inputs).map(([name, input]) => [name, { description: input.description }]),
    ),
    ask: askOf(data),
    read: data.read as SourceReaderName,
    types: types.map((rule) => ({
      match: rule.match,
      logicalType: rule.logicalType,
      ...(rule.options === undefined ? {} : { options: { ...rule.options } }),
    })),
    sources,
    file,
    ...optionalFields(data),
  };
}
