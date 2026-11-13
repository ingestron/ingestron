// The sub-commands of `standard` and `assistant`.
import { readAssistantNames, type AssistantName } from "@ingestron/core/internal";

/** What `standard` was asked to do. */
export type StandardAction =
  { action: "install"; kit: string } | { action: "list"; platform?: string };

/** What `assistant` was asked to do. */
export type AssistantAction = { action: "add"; names: AssistantName[] };

/** standard's sub-command: `install <kit>` or `list`, or a mistake. */
function standardAction(
  extra: string[],
  platform: string | undefined,
): StandardAction | { mistake: string } {
  const [action, kit, ...rest] = extra;
  if (action === undefined) return { mistake: "standard needs install <kit> or list." };
  if (action === "install" && kit === undefined)
    return { mistake: "standard install needs a kit, such as duckdb/local-medallion." };
  if (action === "install" && kit !== undefined && rest.length === 0)
    return { action: "install", kit };
  if (action === "list" && kit === undefined)
    return { action: "list", ...(platform !== undefined && { platform }) };
  return { mistake: `Unknown command "standard ${extra.join(" ")}".` };
}

/** assistant's sub-command: `add <names>`, or a mistake. */
function assistantAction(extra: string[]): AssistantAction | { mistake: string } {
  const [action, ...names] = extra;
  if (action === undefined) return { mistake: "assistant needs add <names>." };
  if (action !== "add") return { mistake: `Unknown command "assistant ${extra.join(" ")}".` };
  const read = readAssistantNames(names, true);
  return "mistake" in read ? read : { action, names: read };
}

/** The sub-command of `standard` or `assistant`, or a mistake; nothing for any other command. */
export function subCommandOf(
  command: string,
  extra: string[],
  platform: string | undefined,
): { standard: StandardAction } | { assistant: AssistantAction } | { mistake: string } | undefined {
  if (command === "standard") {
    const standard = standardAction(extra, platform);
    return "mistake" in standard ? standard : { standard };
  }
  if (command !== "assistant") return undefined;
  const assistant = assistantAction(extra);
  return "mistake" in assistant ? assistant : { assistant };
}
