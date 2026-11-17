// Independent additions name a new definition explicitly.
/** Read connection/flow add, leaving other commands to their existing parsers. */
export function additionCommand(
  command: string,
  extra: string[],
): { command: string; extra: string[] } | { mistake: string } | undefined {
  if (command !== "connection" && command !== "flow") return undefined;
  if (extra[0] !== "add" || !extra[1] || extra.length !== 2)
    return { mistake: `${command} needs add <id>.` };
  return { command, extra };
}
