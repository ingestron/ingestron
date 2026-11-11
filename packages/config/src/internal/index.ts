// The internal module: what the rest of the package uses.
export { isRecord, isSafeKey, mergeValues, type DataRecord } from "./data.js";
export { nearNames } from "./distance.js";
export { matchesGlob } from "./glob.js";
export { importMatcher, matchesImport } from "./import-pattern.js";
export { appendPointer, parsePointer } from "./json-pointer.js";
export { resolveProjectPath } from "./paths.js";
