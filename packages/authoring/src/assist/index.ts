// The assist module: what the rest of the package uses.
export { completionsAt, type Suggestion } from "./completion.js";
export { contractUses } from "./contract-uses.js";
export { connectorOf, fieldAt, settingsAt } from "./fields.js";
export { fixAll } from "./fix-all.js";
export { quickFixes } from "./fixes.js";
export { type QuickFix } from "./quick-fix.js";
export { methodAt, methodInfo, type MethodInfo } from "./methods.js";
export { moveSetting } from "./moves.js";
export { problemsAt, type ProblemEntry } from "./problems-at.js";
