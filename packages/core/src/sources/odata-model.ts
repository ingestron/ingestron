// The types, entity sets and members of a CSDL document (spec/cli/sources.md, section 2.4).
import type { XmlNode } from "./text.js";

/** The name without its namespace prefix: `edmx:Edmx` is `Edmx`. */
export function localName(node: XmlNode): string {
  return node.tagName.slice(node.tagName.indexOf(":") + 1);
}

/** The child elements with the given name, without its prefix. */
export function childrenNamed(node: XmlNode, name: string): XmlNode[] {
  return node.children.filter(
    (child): child is XmlNode => typeof child !== "string" && localName(child) === name,
  );
}

/** The value of an attribute, or undefined when it is missing or has no value. */
export function attributeOf(node: XmlNode, name: string): string | undefined {
  return node.attributes[name] ?? undefined;
}

/** The types a document defines, by the names a `Type` uses: its namespace and its alias. */
export interface Model {
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
export function modelOf(root: XmlNode): Model {
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
export function membersOf(
  type: XmlNode,
  model: Model,
  seen: XmlNode[] = [type],
): { properties: XmlNode[]; key: string[] } {
  const baseName = attributeOf(type, "BaseType");
  const base = baseName === undefined ? undefined : model.types.get(baseName);
  const inherited =
    base === undefined || seen.includes(base)
      ? { properties: [], key: [] }
      : membersOf(base, model, [...seen, base]);
  const own = childrenNamed(type, "Key").flatMap((key) =>
    childrenNamed(key, "PropertyRef").flatMap((ref) => attributeOf(ref, "Name") ?? []),
  );
  return {
    properties: [...inherited.properties, ...childrenNamed(type, "Property")],
    key: own.length > 0 ? own : inherited.key,
  };
}
