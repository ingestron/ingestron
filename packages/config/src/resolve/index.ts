// The resolve module: what the rest of the package uses.
export {
  holdsUnsetEnvvar,
  readYaml,
  tooLarge,
  uniqueDiagnostics,
  type LoadContext,
} from "./context.js";
export {
  checkDuplicateIds,
  loadDocument,
  type DefinitionDocument,
  type LoadedDocument,
} from "./documents.js";
export { createProject, type EnvvarReference, type Project } from "./project.js";
export { isSecretReference, type SecretReference } from "./resolve-string.js";
export { resolveNode } from "./resolve.js";
export type { Scope } from "./scope.js";
