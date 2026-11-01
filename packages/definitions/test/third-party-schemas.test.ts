// Third-party schemas ship unchanged, as schemas/NOTICE.md says.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

const sha256 = (file: string) =>
  createHash("sha256")
    .update(readFileSync(join(import.meta.dirname, "../schemas", file)))
    .digest("hex");

it("ships the ODPS v1.1.0 schema byte for byte as published", () => {
  expect(sha256("odps-v1.1.0.schema.json")).toBe(
    "b7eae1af15b3c6b18e5dffaa2119212acb38ec73286933c76d16c8712e0d90d1",
  );
});
