// The names a person gives for the coding assistants a project is set up for (spec/cli/assistants.md, section 1).

/**
 * The assistant names, in the order they are taken.
 * @internal
 */
export const assistantNames = ["copilot", "claude", "codex", "cursor", "agents"] as const;

/**
 * One assistant name.
 * @internal
 */
export type AssistantName = (typeof assistantNames)[number];

/**
 * The question `init` asks last, with a space after the colon.
 * @internal
 */
export const assistantQuestion =
  "AI assistant files (copilot, claude, codex, cursor, agents or none) [none]: ";

const choices = "copilot, claude, codex, cursor, agents or none";

/**
 * The names in the raw values of `--assistant`, or of `assistant add`'s arguments: each value is
 * comma-separated, duplicates are kept once, and the names come in their own order. `none` alone,
 * no value and an empty answer give no names; with `required`, as `assistant add` has it, they
 * are a mistake. The mistake is the text of the usage error.
 * @internal
 */
export function readAssistantNames(
  values: readonly string[],
  required = false,
): AssistantName[] | { mistake: string } {
  const given = values
    .flatMap((value) => value.split(","))
    .map((name) => name.trim())
    .filter((name) => name !== "");
  const unknown = given.find(
    (name) => name !== "none" && !(assistantNames as readonly string[]).includes(name),
  );
  if (unknown !== undefined)
    return { mistake: `Unknown assistant "${unknown}". Choose from ${choices}.` };
  const named = assistantNames.filter((name) => given.includes(name));
  if (given.includes("none") && named.length > 0)
    return { mistake: '"none" cannot be given with another assistant.' };
  if (required && named.length === 0)
    return {
      mistake: "assistant add needs one or more of copilot, claude, codex, cursor or agents.",
    };
  return named;
}
