// What each code means and how to fix it, shown on the documentation site.
import type { DefinitionCode } from "./diagnostics.js";

/** Help for every code this package reports. */
export const codeHelp: Record<DefinitionCode, { meaning: string; fix: string }> = {
  NO_STANDARD: {
    meaning: "The project has no Standard document.",
    fix: "Add a Standard, or import your organisation's standard in project.yaml.",
  },
  MANY_STANDARDS: {
    meaning: "The project has more than one Standard.",
    fix: "Keep one Standard; put project choices in the Platform and the flows.",
  },
  WRONG_PACK: {
    meaning: "The standard names another pack or version than the one available.",
    fix: "Change the standard's packs list to a version this tool provides.",
  },
  UNKNOWN_PACK: {
    meaning: "The standard names a pack that is not available.",
    fix: "Check the spelling in packs, or use a pack this tool provides.",
  },
  METHOD_CONFLICT: {
    meaning: "Two of the standard's packs have a method with the same name.",
    fix: "List only one of the two packs.",
  },
  MANY_PLATFORMS: {
    meaning: "The project has more than one Platform.",
    fix: "Keep one Platform and vary it per environment with values.",
  },
  UNKNOWN_METHOD: {
    meaning: "No pack has a method with this name.",
    fix: "Check the spelling, or choose a method listed in the reference.",
  },
  WRONG_ACTION: {
    meaning: "The method is for another action, such as a store method in ingest.",
    fix: "Choose a method for this action.",
  },
  METHOD_NOT_ALLOWED: {
    meaning: "The standard's allowed list does not include this method.",
    fix: "Choose an allowed method, or ask the standard's owners to allow it.",
  },
  CONNECTOR_NOT_SUPPORTED: {
    meaning: "The ingest method cannot read this connection's connector.",
    fix: "Use a method that reads it: the problem's fixes list them, including any from a pack the standard does not name yet.",
  },
  CONNECTIVITY_NOT_SUPPORTED: {
    meaning: "The ingest method cannot reach a source with this connectivity.",
    fix: "Use a method that reaches it, such as a copy from a private network: the problem's fixes list them, including any from a pack the standard does not name yet.",
  },
  RUNS_ON: {
    meaning:
      "In an environment that runs on a pack, a table's store or transform belongs to another pack, or the pack has no method that reads landed files; or a method that reads landed files was chosen outside runs-on.",
    fix: "Keep the table's store and transforms with the pack the environment runs on, or remove runs-on from the environment.",
  },
  RUNS_ON_SKIPPED: {
    meaning:
      "In an environment that runs on a pack, a table whose ingest lands no files is left out, with the transforms that read it.",
    fix: "Nothing, if the table is not needed there; otherwise land its files with a method that does.",
  },
  TRANSFORM_COLUMNS: {
    meaning:
      "A transform's query returns a column its contract does not name, or does not return one the contract names. A warning; it is checked only when the query's columns can be read from its outermost SELECT.",
    fix: "Add the column to the contract, or change the query to return the contract's columns.",
  },
  PRODUCT_CONTRACT_UNUSED: {
    meaning: "A data product's output port names a contract that no flow table or transform uses.",
    fix: "Use the contract in a flow's table or a transform, or remove the output port.",
  },
  PRODUCT_NOT_BUILT: {
    meaning:
      "A data product's output is not built in this environment, for example where runs-on leaves its table out. A warning; the passport says so.",
    fix: "Nothing, if that is expected here; otherwise build the table in this environment.",
  },
  PRODUCT_CONTRACT_SHARED: {
    meaning: "Two data products publish the same contract; each published table has one owner.",
    fix: "Publish the contract from one product, and list it as an input port of the other.",
  },
  DUPLICATE_PRODUCT: {
    meaning: "Two files define a data product with the same id.",
    fix: "Give each data product its own id, or remove one of the files.",
  },
  PRODUCT_ID: {
    meaning:
      "A data product's id would name its passport README.md, the file that lists every product.",
    fix: "Choose another id for the data product.",
  },
  PRODUCT_INCOMPLETE: {
    meaning:
      "A data product leaves out a fact the standard's governance requires, such as its owner or purpose.",
    fix: "Add it to the product: a team member with role owner, description.purpose, a support channel or a domain.",
  },
  COLUMN_UNCLASSIFIED: {
    meaning:
      "The standard requires every column a data product publishes to be classified, and this one is not.",
    fix: "Give the column a classification, one of the values the standard lists.",
  },
  CLASSIFICATION_UNKNOWN: {
    meaning: "A published column's classification is not one the standard's governance lists.",
    fix: "Use one of the standard's values; each is offered as a quick fix.",
  },
  SENSITIVE_ACCESS: {
    meaning:
      "A published contract has sensitive columns but does not say who may use it, or a role leaves out a field the standard requires.",
    fix: "Add roles to the contract, each with the access, purpose (description) and approvers the standard asks for.",
  },
  SETTINGS_UNUSED: {
    meaning:
      "Settings are written for a step the table does not have: serve settings when nothing chooses a serve method, or store settings when the flow ends at the landed files.",
    fix: "Remove the settings, or choose the method they are for.",
  },
  HANDOVER: {
    meaning:
      "The method cannot use what the previous action hands over, or a flow names a store after an ingest method that writes the table itself.",
    fix: "Choose a method that accepts the handover, or remove store.uses.",
  },
  FIXED_SETTING: {
    meaning: "A definition changes a setting the standard fixes.",
    fix: "Remove the setting, or ask the standard's owners to change it.",
  },
  BAD_SETTING: {
    meaning: "A setting is unknown, missing or has a value the method does not accept.",
    fix: "Use a setting and value listed in the method's reference.",
  },
  METHOD_CHECK: {
    meaning: "The method found a problem with this table, such as change data without a key.",
    fix: "Follow the message; it names what the method needs.",
  },
  PACK_CHECK: {
    meaning:
      "The pack cannot build this project, such as tables that need different shared resources.",
    fix: "Follow the message; it names the setting or tables to align.",
  },
  UNKNOWN_LAYER: {
    meaning: "The layer is not in the standard's list of layers.",
    fix: "Use a listed layer, or add it to the standard's layers.",
  },
  BAD_PATTERN: {
    meaning: "A name pattern uses a variable or filter that does not exist.",
    fix: "Use the variables listed in the naming reference.",
  },
  BAD_NAME: {
    meaning: "A name pattern gives a name that is not lowercase letters, digits and underscores.",
    fix: "Add a filter such as downcase, or change the pattern.",
  },
  DUPLICATE_NAME: {
    meaning: "Two tables would get the same full name.",
    fix: "Rename a table, or include the flow or source in the table pattern.",
  },
  DUPLICATE_TABLE: {
    meaning: "Two flow tables or transforms have the same table name.",
    fix: "Rename one; transforms refer to tables by name.",
  },
  UNKNOWN_INPUT: {
    meaning: "A transform reads a table that no flow or transform produces.",
    fix: "Check the spelling in inputs, or add the flow table.",
  },
  UNKNOWN_CODE_VALUE: {
    meaning: "A `${values.…}` in a transform's code file names a value that does not exist.",
    fix: "Add the value to `values` in `project.yaml`, for every environment, or correct its name.",
  },
  INPUT_CYCLE: {
    meaning: "Transforms read each other's results in a loop.",
    fix: "Remove one of the inputs so the transforms run in order.",
  },
  CONTRACT_TABLE: {
    meaning: "The contract has several schema entries and none is named after the table.",
    fix: "Name a schema entry after the table, or link a contract with one entry.",
  },
  CONTRACT_FIELD_UNUSED: {
    meaning:
      "A contract writes a field that the standard's packs do not use yet, so it changes nothing in what is generated. A warning.",
    fix: "Leave it as documentation, or follow the reason the hint gives for each pack. Each pack's page lists what it does with every contract field.",
  },
  QUALITY_RULE_NOT_CHECKED: {
    meaning:
      "A contract quality rule compares a count over all rows, such as a row count or a share of nulls, which a check of one row cannot. A warning: the rule stays as documentation.",
    fix: "Write the rule so it allows no failing row (mustBe: 0) on nullValues, missingValues or invalidValues, or check the count another way.",
  },
  CAPABILITY_OFF: {
    meaning:
      "The definitions use a feature that changes shared objects on the platform, such as tags or schemas, and the platform has not turned it on, so it is not applied. A warning.",
    fix: "Turn it on with manage.<capability> in platform.yaml, and grant what the hint says it needs; each pack's page lists its capabilities.",
  },
  PLACEHOLDER_NOT_REPLACED: {
    meaning:
      "A value has {{ … }}, which is replaced only in naming patterns and transform code, so it stays as written. A warning.",
    fix: "Use a ${…} reference instead, such as ${environment.name}, ${project.id} or ${values.<name>}; they work in any value.",
  },
};
