// A Parquet sample whose bytes are a view into a larger buffer, as Node's file reads give them.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { readSourceFile } from "../src/sources/read-file.js";

const file = join(
  resolve(import.meta.dirname, "../../../spec/cli/conformance/sources/readers"),
  "orders.parquet",
);

describe("readSourceFile: a Parquet file at an offset in its buffer", () => {
  it("reads the same columns as the file alone", () => {
    const bytes = new Uint8Array(readFileSync(file));
    const alone = readSourceFile({
      file: "sources/shop/orders.parquet",
      contents: bytes,
      object: "o",
    });
    const buffer = new Uint8Array(bytes.length + 24).fill(7);
    buffer.set(bytes, 13);
    const view = buffer.subarray(13, 13 + bytes.length);
    expect(view.byteOffset).toBe(13);
    const result = readSourceFile({
      file: "sources/shop/orders.parquet",
      contents: view,
      object: "o",
    });
    expect(alone).toHaveProperty("tables");
    expect(result).toStrictEqual(alone);
  });
});
