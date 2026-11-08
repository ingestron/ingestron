// The folder module: what the rest of the package uses.
export type { Entry, OutputFolder } from "./folder.js";
export { memoryFolder, type MemoryFolder, type MemoryFolderOptions } from "./memory-folder.js";
export { nodeFolder } from "./node-folder.js";
export { checkWantedPaths, lockFile, manifestFile, pathProblem } from "./paths.js";
