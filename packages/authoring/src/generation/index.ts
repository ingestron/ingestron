// The generation module: what the rest of the package uses.
export { editorDiagnostics } from "./generation.js";
export { compareEnvironments, platformRequest, stopped } from "./platform-request.js";
export {
  generatedFiles,
  generatedForTable,
  tableAtCursor,
  type Files,
  type Generated,
} from "./preview.js";
