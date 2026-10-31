// Every field the editor and the documentation explain is fully described:
// what it is, what each allowed value means, and an example of free text.
// A schema or pack change that leaves a gap fails here.
import { packs } from "@ingestron/cli";
import {
  contractReads,
  contractUseOf,
  documentReference,
  methodReference,
  referenceKinds,
  type FieldInfo,
} from "@ingestron/definitions";
import { describe, expect, it } from "vitest";

const fields: { where: string; field: FieldInfo }[] = [
  ...Object.keys(referenceKinds).flatMap((kind) =>
    documentReference(kind as keyof typeof referenceKinds).map((field) => ({ where: kind, field })),
  ),
  ...packs.flatMap((pack) =>
    Object.keys(pack.methods).flatMap((id) =>
      methodReference(pack, id).map((field) => ({ where: `${pack.id}/${id}`, field })),
    ),
  ),
];
/** Contracts follow ODCS: value meanings and examples are owed only for the fields Ingestron reads. */
const owed = fields.filter(
  ({ where, field }) => where !== "DataContract" || contractReads.includes(field.path.join(".")),
);
const names = (found: typeof fields) =>
  found.map(({ where, field }) => `${where}: ${field.path.join(".")}`);

describe("field descriptions", () => {
  it("cover documents, contracts and every pack's methods", () => {
    expect(fields.length).toBeGreaterThan(400);
    expect(fields.some(({ where }) => where === "DataContract")).toBe(true);
  });

  it("say what every field is", () => {
    expect(names(fields.filter(({ field }) => !field.description))).toEqual([]);
  });

  it("say what every allowed value means", () => {
    const vague = owed.filter(
      ({ field }) =>
        (field.values?.length ?? 0) > 1 && field.values!.some((item) => !item.description),
    );
    expect(names(vague)).toEqual([]);
  });

  it("give an example of every free-text field", () => {
    const bare = owed.filter(
      ({ field }) => field.type === "text" && !field.values && field.example === undefined,
    );
    expect(names(bare)).toEqual([]);
  });

  it("each have their own page anchor", () => {
    const anchors = fields.map(({ field }) => field.docs);
    expect(anchors.filter((anchor, index) => anchors.indexOf(anchor) !== index)).toEqual([]);
  });

  it("say, for every pack, what it does with every contract field", () => {
    const contract = fields.filter(({ where }) => where === "DataContract");
    const gaps = packs.flatMap((pack) =>
      contract
        .filter(({ field }) => !contractUseOf(pack, field.path.join(".")))
        .map(({ field }) => `${pack.id}: ${field.path.join(".")}`),
    );
    expect(gaps).toEqual([]);
  });
});
