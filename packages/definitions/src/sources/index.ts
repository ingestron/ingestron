// The sources module: what the rest of the package uses.
export { checkSourceMetadata, metadataTables } from "./metadata.js";
export { matchObject } from "./match.js";
export { matchTable, objectNotKnown, objectPointer, type TableMatch } from "./table.js";
export type { SourceTable } from "./source-table.js";
export { compareSourceColumns } from "./compare.js";
export type { SourceBefore, SourceColumnBefore, SourceDifference } from "./compare.js";
export { compareWithContract } from "./contract-compare.js";
export { columnsPlace, metadataContract, metadataObject } from "./metadata-contract.js";
