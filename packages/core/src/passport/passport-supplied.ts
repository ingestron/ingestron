// A passport built from a model resolved for deploy writes each deploy-time
// value by its variable's name (spec/cli/passport.md).
import type { ResolvedModel } from "@ingestron/definitions";

/**
 * The text with each deploy-time value written as supplied when deploying: one that stands
 * alone as `` `NAME` (supplied when deploying) ``, and a word that holds one with `<NAME>` in
 * its place, as code, followed by the names.
 */
export function supplied(model: ResolvedModel, text: string): string {
  const names = new Map((model.deployValues ?? []).map((value) => [value.text, value.name]));
  return names.size === 0 ? text : text.replace(/\S+/g, (word) => written(word, names));
}

/** Brackets and punctuation around a word, kept outside what is written for it. */
const around = /^([([]*)(.*?)([)\],.;:]*)$/s;

function written(word: string, names: ReadonlyMap<string, string>): string {
  const found = [...names].filter(([text]) => word.includes(text));
  if (found.length === 0) return word;
  const [, before = "", core = "", after = ""] = around.exec(word) ?? [];
  if (found.length === 1 && core === found[0]![0])
    return `${before}\`${found[0]![1]}\` (supplied when deploying)${after}`;
  const shown = found.reduce(
    (text, [reference, name]) => text.replaceAll(reference, `<${name}>`),
    core,
  );
  const code = shown.includes("`") ? shown : `\`${shown}\``;
  const listed = found.map(([, name]) => `\`${name}\``).join(" and ");
  return `${before}${code} (${listed} supplied when deploying)${after}`;
}
