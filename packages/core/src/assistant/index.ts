// The assistant module: the project guide for coding assistants, what it is written from, and the
// pointer files (spec/cli/assistants.md).
export {
  assistantNames,
  assistantQuestion,
  readAssistantNames,
  type AssistantName,
} from "./names.js";
export {
  guideFacts,
  type GuideFacts,
  type GuideOutput,
  type GuideStandard,
  type NoGuide,
} from "./facts.js";
export { guideSection } from "./guide.js";
export { guideHash, guideUpdate, hasSourceGuide, type GuideUpdate } from "./section.js";
export { pointerFiles, pointerUpdate } from "./pointers.js";
export { guideLine } from "./lines.js";
