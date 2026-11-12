// The OData reader (spec/cli/sources.md, section 2.4): a CSDL document, the `$metadata` of an OData
// service. Entity sets, or entity types when the recipe says so, are tables.
import type { SourceColumnDoc } from "@ingestron/definitions";
import type { Outcome, Reader, ReaderInput, SourceTableRead } from "./result.js";
import { maxNesting } from "./records.js";
import { itemsName } from "./sample-columns.js";
import { attributeOf, localName, modelOf, membersOf, type Model } from "./odata-model.js";
import { extensionOf, type XmlNode } from "./text.js";

const logicalTypes: Record<string, string> = {
  "Edm.String": "string",
  "Edm.Byte": "integer",
  "Edm.SByte": "integer",
  "Edm.Int16": "integer",
  "Edm.Int32": "integer",
  "Edm.Int64": "integer",
  "Edm.Decimal": "number",
  "Edm.Single": "number",
  "Edm.Double": "number",
  "Edm.Boolean": "boolean",
  "Edm.Date": "date",
  "Edm.DateTimeOffset": "timestamp",
  "Edm.DateTime": "timestamp",
  "Edm.TimeOfDay": "time",
  "Edm.Time": "time",
};

/** A whole number from an attribute, or undefined when it is anything else, such as `max`. */
function whole(text: string | undefined): number | undefined {
  return text !== undefined && /^\d+$/.test(text) ? Number(text) : undefined;
}

/** What reading one table needs: the document, and the complex types already written in full. */
interface Walk {
  model: Model;
  expanded: Set<XmlNode>;
}

/** A property of the type or of an element, without its name or whether it is required. */
type Shape = Omit<SourceColumnDoc, "name" | "required">;

/** A property typed by an `Edm` primitive, with the facets that carry over. */
function primitiveShape(type: string, logicalType: string, facets: XmlNode): Shape {
  const maxLength = type === "Edm.String" ? whole(attributeOf(facets, "MaxLength")) : undefined;
  const precision = whole(attributeOf(facets, "Precision"));
  const scale = attributeOf(facets, "Scale");
  const options =
    type === "Edm.Decimal"
      ? {
          ...(precision !== undefined && { precision }),
          // `Variable`, in any case, means any scale, which no whole number says: it gives none.
          ...(scale?.toLowerCase() !== "variable" && { scale: whole(scale) ?? 0 }),
        }
      : maxLength === undefined
        ? undefined
        : { maxLength };
  return {
    sourceType: type,
    logicalType,
    ...(options && Object.keys(options).length > 0 && { logicalTypeOptions: options }),
  };
}

/**
 * A property typed by a type the document defines: a complex type, written in full only the first
 * time in a table and not below the deepest level, or a type it does not define, read as string.
 */
function definedShape(type: string, walk: Walk, depth: number): Shape {
  const complex = walk.model.types.get(type);
  if (complex === undefined) return { sourceType: type, logicalType: "string" };
  if (walk.expanded.has(complex) || depth >= maxNesting)
    return { sourceType: type, logicalType: "object" };
  walk.expanded.add(complex);
  const properties = membersOf(complex, walk.model).properties.map((property) =>
    columnOf(property, walk, depth + 1),
  );
  return {
    sourceType: type,
    logicalType: "object",
    ...(properties.length > 0 && { properties }),
  };
}

/** The element of `Collection(...)`, or undefined for any other type. */
function elementOf(type: string): string | undefined {
  return /^Collection\((.*)\)$/.exec(type)?.[1];
}

function shapeOf(type: string, facets: XmlNode, walk: Walk, depth: number): Shape {
  const element = elementOf(type);
  if (element !== undefined)
    return {
      sourceType: type,
      logicalType: "array",
      items: {
        name: itemsName,
        ...shapeOf(element, facets, walk, depth),
        required: attributeOf(facets, "Nullable") === "false",
      },
    };
  const logicalType = logicalTypes[type];
  return logicalType === undefined
    ? definedShape(type, walk, depth)
    : primitiveShape(type, logicalType, facets);
}

/**
 * A property as a column. A key column and a `Collection` are required; `Nullable="false"` on a
 * `Collection` is about its elements (CSDL 4.01, section 7.2.1).
 */
function columnOf(property: XmlNode, walk: Walk, depth: number, place?: number): SourceColumnDoc {
  const type = attributeOf(property, "Type") ?? "";
  return {
    name: attributeOf(property, "Name") ?? "",
    ...shapeOf(type, property, walk, depth),
    required:
      place !== undefined ||
      elementOf(type) !== undefined ||
      attributeOf(property, "Nullable") === "false",
    ...(place !== undefined && { primaryKeyPosition: place }),
  };
}

function tableOf(object: string, type: XmlNode, model: Model): SourceTableRead {
  const { properties, key } = membersOf(type, model);
  const walk: Walk = { model, expanded: new Set([type]) };
  const columns = properties
    .filter((property) => attributeOf(property, "Name") !== undefined)
    .map((property) => {
      const place = key.indexOf(attributeOf(property, "Name")!);
      return columnOf(property, walk, 0, place < 0 ? undefined : place + 1);
    });
  return { object, columns };
}

/** The document's root element, undefined when the file has none. */
function rootOf(input: ReaderInput): XmlNode | { refused: string[] } {
  const parsed = input.xml();
  if ("refused" in parsed) return parsed;
  const root = parsed.value.find((node) => !/^[?!]/.test(node.tagName));
  return root !== undefined && localName(root) === "Edmx"
    ? root
    : {
        refused: [`${input.file} is not an OData CSDL document: its root element is not Edmx.`],
      };
}

/** The tables of the entity sets, and a note for each set whose type the document does not define. */
function setTables(model: Model): { tables: SourceTableRead[]; notes: string[] } {
  const tables: SourceTableRead[] = [];
  const notes: string[] = [];
  for (const set of model.sets) {
    const type = model.types.get(set.type);
    if (type === undefined)
      notes.push(
        `The entity set "${set.name}" is left out: its type "${set.type}" is not defined in the document.`,
      );
    else if (localName(type) === "EntityType") tables.push(tableOf(set.name, type, model));
  }
  return { tables, notes };
}

/** Reads the document's entity sets, or entity types, as tables. */
function read(input: ReaderInput): Outcome {
  const root = rootOf(input);
  if ("refused" in root) return root;
  const model = modelOf(root);
  const byType = input.recipe?.objects === "types";
  const { tables, notes } = byType
    ? {
        tables: model.entityTypes
          .filter((type) => attributeOf(type, "Abstract") !== "true")
          .map((type) => tableOf(attributeOf(type, "Name")!, type, model)),
        notes: [],
      }
    : setTables(model);
  if (tables.length === 0)
    return { refused: [`${input.file} describes no entity ${byType ? "types" : "sets"}.`] };
  return { tables, notes };
}

/**
 * True for CSDL, or XML that is not valid, which `read` then says, in a file named `.xml` or
 * `.edmx`; or for any XML when the recipe's reader is `odata`.
 */
function accepts(input: ReaderInput): boolean {
  if (!input.text.trimStart().startsWith("<")) return false;
  if (input.recipe?.read !== "odata" && ![".xml", ".edmx"].includes(extensionOf(input.file)))
    return false;
  return "refused" in input.xml() || !("refused" in rootOf(input));
}

/** The OData reader. */
export const odataReader: Reader = { accepts, read };
