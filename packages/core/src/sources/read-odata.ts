// The OData reader (spec/cli/sources.md, section 2.4): a CSDL document, the `$metadata` of an OData
// service. Entity sets, or entity types when the recipe says so, are tables.
import type { SourceColumnDoc } from "@ingestron/definitions";
import type { Outcome, Reader, ReaderInput, SourceTableRead } from "./result.js";
import { itemsName } from "./sample-columns.js";
import type { XmlNode } from "./text.js";

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

/** The name without its namespace prefix: `edmx:Edmx` is `Edmx`. */
function localName(node: XmlNode): string {
  return node.tagName.slice(node.tagName.indexOf(":") + 1);
}

function childrenNamed(node: XmlNode, name: string): XmlNode[] {
  return node.children.filter(
    (child): child is XmlNode => typeof child !== "string" && localName(child) === name,
  );
}

function attributeOf(node: XmlNode, name: string): string | undefined {
  return node.attributes[name] ?? undefined;
}

/** A whole number from an attribute, or undefined when it is anything else, such as `max`. */
function whole(text: string | undefined): number | undefined {
  return text !== undefined && /^\d+$/.test(text) ? Number(text) : undefined;
}

/** The types a document defines, by the names a `Type` uses: its namespace and its alias. */
interface Model {
  types: Map<string, XmlNode>;
  entityTypes: XmlNode[];
  sets: { name: string; type: string }[];
}

/** Adds one entity or complex type to the model under each name a `Type` may use for it. */
function addType(type: XmlNode, prefixes: string[], model: Model): void {
  const name = attributeOf(type, "Name");
  if (name === undefined) return;
  for (const prefix of prefixes) model.types.set(`${prefix}.${name}`, type);
  if (localName(type) === "EntityType") model.entityTypes.push(type);
}

/** Adds the entity and complex types of one schema to the model. */
function addTypes(schema: XmlNode, model: Model): void {
  const prefixes = ["Namespace", "Alias"].flatMap((name) => attributeOf(schema, name) ?? []);
  for (const kind of ["EntityType", "ComplexType"])
    for (const type of childrenNamed(schema, kind)) addType(type, prefixes, model);
}

/** Adds the entity sets of one schema's containers to the model. */
function addSets(schema: XmlNode, model: Model): void {
  const sets = childrenNamed(schema, "EntityContainer").flatMap((container) =>
    childrenNamed(container, "EntitySet"),
  );
  for (const set of sets) {
    const name = attributeOf(set, "Name");
    const type = attributeOf(set, "EntityType");
    if (name !== undefined && type !== undefined) model.sets.push({ name, type });
  }
}

/** The types, entity types and entity sets of the document. */
function modelOf(root: XmlNode): Model {
  const model: Model = { types: new Map(), entityTypes: [], sets: [] };
  const schemas = childrenNamed(root, "DataServices").flatMap((services) =>
    childrenNamed(services, "Schema"),
  );
  for (const schema of schemas) {
    addTypes(schema, model);
    addSets(schema, model);
  }
  return model;
}

/** A type's properties, those of its base types first, and its key, which a base type may give. */
function membersOf(
  type: XmlNode,
  model: Model,
  seen: XmlNode[] = [],
): { properties: XmlNode[]; key: string[] } {
  const baseName = attributeOf(type, "BaseType");
  const base = baseName === undefined ? undefined : model.types.get(baseName);
  const inherited =
    base === undefined || seen.includes(base)
      ? { properties: [], key: [] }
      : membersOf(base, model, [...seen, type]);
  const own = childrenNamed(type, "Key").flatMap((key) =>
    childrenNamed(key, "PropertyRef").flatMap((ref) => attributeOf(ref, "Name") ?? []),
  );
  return {
    properties: [...inherited.properties, ...childrenNamed(type, "Property")],
    key: own.length > 0 ? own : inherited.key,
  };
}

/** A property of the type or of an element, without its name or whether it is required. */
type Shape = Omit<SourceColumnDoc, "name" | "required">;

/** A property typed by an `Edm` primitive, with the facets that carry over. */
function primitiveShape(type: string, logicalType: string, facets: XmlNode): Shape {
  const options = {
    ...(type === "Edm.String" && { maxLength: whole(attributeOf(facets, "MaxLength")) }),
    ...(type === "Edm.Decimal" && {
      precision: whole(attributeOf(facets, "Precision")),
      scale: whole(attributeOf(facets, "Scale")),
    }),
  };
  const given = Object.fromEntries(
    Object.entries(options).filter(([, value]) => value !== undefined),
  );
  return {
    sourceType: type,
    logicalType,
    ...(Object.keys(given).length > 0 && { logicalTypeOptions: given }),
  };
}

/** A property typed by a type the document defines: a complex type, or one it does not define. */
function definedShape(type: string, model: Model, trail: XmlNode[]): Shape {
  const complex = model.types.get(type);
  if (complex === undefined) return { sourceType: type, logicalType: "string" };
  const properties = trail.includes(complex)
    ? []
    : membersOf(complex, model).properties.map((property) =>
        columnOf(property, model, [...trail, complex]),
      );
  return {
    sourceType: type,
    logicalType: "object",
    ...(properties.length > 0 && { properties }),
  };
}

function shapeOf(type: string, facets: XmlNode, model: Model, trail: XmlNode[]): Shape {
  const element = /^Collection\((.*)\)$/.exec(type)?.[1];
  if (element !== undefined)
    return {
      sourceType: type,
      logicalType: "array",
      items: { name: itemsName, ...shapeOf(element, facets, model, trail), required: false },
    };
  const logicalType = logicalTypes[type];
  return logicalType === undefined
    ? definedShape(type, model, trail)
    : primitiveShape(type, logicalType, facets);
}

function columnOf(
  property: XmlNode,
  model: Model,
  trail: XmlNode[],
  place?: number,
): SourceColumnDoc {
  return {
    name: attributeOf(property, "Name") ?? "",
    ...shapeOf(attributeOf(property, "Type") ?? "", property, model, trail),
    required: attributeOf(property, "Nullable") === "false",
    ...(place !== undefined && { primaryKeyPosition: place }),
  };
}

function tableOf(object: string, type: XmlNode, model: Model): SourceTableRead {
  const { properties, key } = membersOf(type, model);
  const columns = properties
    .filter((property) => attributeOf(property, "Name") !== undefined)
    .map((property) => {
      const place = key.indexOf(attributeOf(property, "Name")!);
      return columnOf(property, model, [type], place < 0 ? undefined : place + 1);
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

/** Reads the document's entity sets, or entity types, as tables. */
function read(input: ReaderInput): Outcome {
  const root = rootOf(input);
  if ("refused" in root) return root;
  const model = modelOf(root);
  const byType = input.recipe?.objects === "types";
  const tables = byType
    ? model.entityTypes.map((type) => tableOf(attributeOf(type, "Name")!, type, model))
    : model.sets.flatMap((set) => {
        const type = model.types.get(set.type);
        return type === undefined || localName(type) !== "EntityType"
          ? []
          : [tableOf(set.name, type, model)];
      });
  if (tables.length === 0)
    return { refused: [`${input.file} describes no entity ${byType ? "types" : "sets"}.`] };
  return { tables, notes: [] };
}

/** True for XML that is CSDL, or that is not valid XML, which `read` then says. */
function accepts(input: ReaderInput): boolean {
  if (!input.text.trimStart().startsWith("<")) return false;
  return "refused" in input.xml() || !("refused" in rootOf(input));
}

/** The OData reader. */
export const odataReader: Reader = { accepts, read };
