// Project creation flags and named setting answers.
import { readAssistantNames } from "@ingestron/core/internal";
import type { Options, Values } from "./args.js";

/** The init options that are text, each kept only when it is given. */
const initTexts = [
  "template",
  "platform",
  "kit",
  "connector",
  "via",
  "connectivity",
  "name",
  "standard",
] as const;

/** Read project creation flags and setting answers. */
export function initOptions(values: Values, folder = "."): Options["init"] | { mistake: string } {
  const set = answersOf(values.set ?? []);
  if (typeof set === "string") return { mistake: set };
  const given = initTexts.flatMap((key) =>
    values[key] === undefined ? [] : [[key, values[key]] as const],
  );
  const named = values.assistant && readAssistantNames(values.assistant);
  if (named && "mistake" in named) return named;
  const assistants = values.assistant === undefined ? {} : { assistants: values.assistant };
  return {
    folder,
    ...Object.fromEntries(given),
    set,
    yes: values.yes,
    ...(values.empty && { empty: true }),
    ...assistants,
  };
}

/** `--set key=value` pairs, or a mistake naming the one without `=`. */
function answersOf(pairs: string[]): Record<string, string> | string {
  const answers: Record<string, string> = {};
  for (const pair of pairs) {
    const at = pair.indexOf("=");
    if (at < 1) return `--set ${pair}: write it as <name>=<text>.`;
    answers[pair.slice(0, at)] = pair.slice(at + 1);
  }
  return answers;
}
