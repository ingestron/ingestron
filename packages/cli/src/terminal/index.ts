// The terminal module: what the rest of the package uses.
export { readArgs, type Options, type SourceAction, type StandardAction } from "./args.js";
export { commands, flags, usage } from "./help.js";
export { askInTerminal } from "./ask.js";
export { exitOnClosedPipe } from "./closed-pipe.js";
export type { Io } from "./io.js";
export { printReports } from "./reports.js";
