// A sample names no table when its path does not: the import says so with `needsObject`, so
// that the editor asks for the table rather than reading the sample reader's words.
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ProjectSnapshot } from "../src/index.js";

const conformance = join(import.meta.dirname, "../../../spec/cli/conformance/sources/request");
const sample = Buffer.from("shipment_id,shipped_at\n1,2026-11-01T10:00:00Z\n");
const at = "2026-11-12T09:00:00Z";
let folder = "";
beforeAll(() => {
  folder = mkdtempSync(join(tmpdir(), "source-import-object-"));
  cpSync(conformance, folder, { recursive: true });
});
afterAll(() => rmSync(folder, { recursive: true, force: true }));

describe("importing a sample whose path names no table", () => {
  it("is refused with needsObject, and the sample reader's reason", () => {
    const edit = ProjectSnapshot.open(folder).importSource("/elsewhere/export.csv", sample, {
      connection: "landing",
      at,
    });
    expect(edit).toEqual({
      refused: ["Name the table this file describes with --object."],
      needsObject: true,
    });
  });

  it("imports once the table is named", () => {
    const edit = ProjectSnapshot.open(folder).importSource("/elsewhere/export.csv", sample, {
      connection: "landing",
      object: "shipments",
      at,
    });
    expect("files" in edit).toBe(true);
  });

  it("has no needsObject when the import stops for another reason", () => {
    const snapshot = ProjectSnapshot.open(folder);
    expect(snapshot.importSource("/elsewhere/export.csv", sample, { at })).toEqual({
      refused: ["Name the connection this file describes."],
    });
    const empty = snapshot.importSource("/elsewhere/export.csv", Buffer.from(""), {
      connection: "landing",
      object: "shipments",
      at,
    });
    expect("refused" in empty && !("needsObject" in empty)).toBe(true);
  });
});
