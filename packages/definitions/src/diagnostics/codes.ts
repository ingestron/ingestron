// What each code means and how to fix it, shown on the documentation site.
import type { CodeHelp } from "./code-help.js";
import type { DefinitionCode } from "./diagnostics.js";
import { acceptCodeHelp } from "./accept-codes.js";
import { environmentCodeHelp } from "./environment-codes.js";
import { intentCodeHelp } from "./intent-codes.js";
import { layerCodeHelp } from "./layer-codes.js";
import { methodCodeHelp } from "./method-codes.js";
import { platformCodeHelp } from "./platform-codes.js";
import { productCodeHelp } from "./product-codes.js";
import { accessCodeHelp } from "./access-codes.js";
import { cleanseCodeHelp } from "./cleanse-codes.js";
import { sourceCodeHelp } from "./source-codes.js";
import { transformCodeHelp } from "./transform-codes.js";

/**
 * Help for every code this package reports.
 * @public
 */
export const codeHelp: Record<DefinitionCode, CodeHelp> = {
  ...environmentCodeHelp,
  ...layerCodeHelp,
  ...intentCodeHelp,
  ...platformCodeHelp,
  ...productCodeHelp,
  ...accessCodeHelp,
  ...transformCodeHelp,
  ...cleanseCodeHelp,
  ...acceptCodeHelp,
  ...sourceCodeHelp,
  NO_STANDARD: {
    meaning: "The project has no Standard document.",
    fix: "Add a Standard, or import your organisation's standard in project.yaml.",
    severities: ["error"],
    origin: "resolve",
  },
  MANY_STANDARDS: {
    meaning: "The project has more than one Standard.",
    fix: "Keep one Standard; put project choices in the Platform and the flows.",
    severities: ["error"],
    origin: "resolve",
  },
  WRONG_PACK: {
    meaning: "The standard names another pack or version than the one available.",
    fix: "Change the standard's packs list to a version this tool provides.",
    severities: ["error"],
    origin: "resolve",
  },
  PACK_LOAD: {
    meaning:
      "A pack given to Ingestron has a mistake of its own, such as a Platform field the Platform document does not have, so nothing is checked or generated.",
    fix: "Install a version of Ingestron, or of the editor extension, that fixes the pack.",
    severities: ["error"],
    origin: "resolve",
  },
  UNKNOWN_PACK: {
    meaning: "The standard or a Platform section names a pack that is not available or not named.",
    fix: "Check the spelling, use a pack this tool provides, or add the pack to the standard.",
    severities: ["error"],
    origin: "resolve",
  },
  METHOD_CONFLICT: {
    meaning: "Two of the standard's packs have a method with the same name.",
    fix: "List only one of the two packs.",
    severities: ["error"],
    origin: "resolve",
  },
  MANY_PLATFORMS: {
    meaning: "The project has more than one Platform.",
    fix: "Keep one Platform and vary it per environment with values.",
    severities: ["error"],
    origin: "resolve",
  },
  ...methodCodeHelp,
  SETTINGS_UNUSED: {
    meaning:
      "Settings are written for a step the table does not have: serve settings when nothing chooses a serve method, or store settings when the flow ends at the landed files.",
    fix: "Remove the settings, or choose the method they are for.",
    severities: ["warning"],
    origin: "resolve",
  },
  HANDOVER: {
    meaning:
      "The method cannot use what the previous action hands over, or a flow names a store after an ingest method that writes the table itself.",
    fix: "Choose a method that accepts the handover, or remove store.uses.",
    severities: ["error"],
    origin: "resolve",
  },
  FIXED_SETTING: {
    meaning: "A definition changes a setting the standard fixes.",
    fix: "Remove the setting, or ask the standard's owners to change it.",
    severities: ["error"],
    origin: "resolve",
  },
  BAD_SETTING: {
    meaning: "A setting is unknown, missing or has a value the method does not accept.",
    fix: "Use a setting and value listed in the method's reference.",
    severities: ["error"],
    origin: "resolve",
  },
  METHOD_CHECK: {
    meaning: "The method found a problem with this table, such as change data without a key.",
    fix: "Follow the message; it names what the method needs.",
    severities: ["error"],
    origin: "resolve",
  },
  PACK_CHECK: {
    meaning:
      "The pack cannot build this project, such as tables that need different shared resources.",
    fix: "Follow the message; it names the setting or tables to align.",
    severities: ["error"],
    origin: "resolve",
  },
  BAD_PATTERN: {
    meaning: "A name pattern uses a variable or filter that does not exist.",
    fix: "Use the variables listed in the naming reference.",
    severities: ["error"],
    origin: "resolve",
  },
  BAD_NAME: {
    meaning: "A name pattern gives a name that is not lowercase letters, digits and underscores.",
    fix: "Add a filter such as downcase, or change the pattern.",
    severities: ["error"],
    origin: "resolve",
  },
  DUPLICATE_NAME: {
    meaning: "Two tables would get the same full name.",
    fix: "Rename a table, or include the flow or source in the table pattern.",
    severities: ["error"],
    origin: "resolve",
  },
  DUPLICATE_TABLE: {
    meaning: "Two flow tables or transforms have the same table name.",
    fix: "Rename one; transforms refer to tables by name.",
    severities: ["error"],
    origin: "resolve",
  },
  UNKNOWN_INPUT: {
    meaning: "A transform reads a table that no flow or transform produces.",
    fix: "Check the spelling in inputs, or add the flow table.",
    severities: ["error"],
    origin: "resolve",
  },
  UNKNOWN_CODE_VALUE: {
    meaning: "A `${values.…}` in a transform's code file names a value that does not exist.",
    fix: "Add the value to `values` in `project.yaml`, for every environment, or correct its name.",
    severities: ["error"],
    origin: "resolve",
  },
  INPUT_CYCLE: {
    meaning: "Transforms read each other's results in a loop.",
    fix: "Remove one of the inputs so the transforms run in order.",
    severities: ["error"],
    origin: "resolve",
  },
  CONTRACT_TABLE: {
    meaning: "The contract has several schema entries and none is named after the table.",
    fix: "Name a schema entry after the table, or link a contract with one entry.",
    severities: ["error"],
    origin: "resolve",
  },
  CONTRACT_FIELD_UNUSED: {
    meaning:
      "No longer reported. A contract field that the pack keeping the table does not use yet is now NOT_APPLIED.",
    fix: "Follow the help for NOT_APPLIED.",
    severities: [],
    origin: "resolve",
  },
  QUALITY_RULE_NOT_CHECKED: {
    meaning:
      "A contract quality rule cannot be checked as written, such as a custom rule, which another engine runs. A warning: the rule stays as documentation.",
    fix: "Write it as a library or sql rule with a comparison, such as mustBe: 0, to have it checked.",
    severities: ["warning"],
    origin: "resolve",
  },
  CAPABILITY_OFF: {
    meaning:
      "The definitions use a feature the platform turns on, such as tags, schemas or table checks (a contract rule that counts over all rows), and the platform has not turned it on, so it is not applied. A warning.",
    fix: "Turn it on with manage.<capability> in platform.yaml, and grant what the hint says it needs; each pack's page lists its capabilities.",
    severities: ["warning"],
    origin: "resolve",
  },
  PLACEHOLDER_NOT_REPLACED: {
    meaning:
      "A value has {{ … }}, which is replaced only in naming patterns and transform code, so it stays as written. A warning.",
    fix: "Use a ${…} reference instead, such as ${environment.name}, ${project.id} or ${values.<name>}; they work in any value.",
    severities: ["warning"],
    origin: "resolve",
  },
  REPLACE_ME: {
    meaning:
      "A value is still REPLACE_ME, which ingestron init writes where it cannot know the value, such as a host or a storage account. A warning, and an error in ingestron check.",
    fix: "Write the real value; the comment above it says what it is, and the project's README.md says where to find it.",
    severities: ["warning", "error"],
    origin: "resolve",
  },
};
