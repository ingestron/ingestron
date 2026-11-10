// The list of time zones the package ships (specification section 6.3).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { zones as zoneData } from "../../src/data/index.js";
import { isZone, zoneAfter } from "../../src/resolve/timezones.js";
import type { Contract } from "../../src/index.js";

describe("the shipped zone list", () => {
  it("records where it came from, and holds each name once, in order", () => {
    expect(zoneData.tzdb).toMatch(/^\d{4}[a-z]$/);
    expect(zoneData.node).toMatch(/^v22\./);
    expect(zoneData.names).toEqual([...new Set(zoneData.names)].sort());
    expect(zoneData.names.length).toBeGreaterThan(400);
  });

  it("holds the names that definitions use", () => {
    for (const name of ["UTC", "Etc/UTC", "Europe/London", "America/New_York", "Asia/Tokyo"])
      expect(isZone(name), name).toBe(true);
  });

  it("matches names exactly", () => {
    for (const name of ["europe/london", "Europe/Londn", "Mars/Olympus", "UTC+1", ""])
      expect(isZone(name), name).toBe(false);
  });

  it("is the list the runtime gives, when this runtime ships the same database", () => {
    if (process.versions.tz !== zoneData.tzdb) return;
    const given = new Set([...Intl.supportedValuesOf("timeZone"), "UTC", "Etc/UTC"]);
    expect(new Set(zoneData.names)).toEqual(given);
  });
});

/** Every file under a folder that has one of the extensions. */
function filesIn(folder: string, extensions: string[]): string[] {
  if (!existsSync(folder)) return [];
  return readdirSync(folder).flatMap((entry) => {
    const path = join(folder, entry);
    if (entry === "node_modules" || entry === ".git") return [];
    if (statSync(path).isDirectory()) return filesIn(path, extensions);
    return extensions.some((extension) => path.endsWith(extension)) ? [path] : [];
  });
}

/** Zone names written as Area/Location, which cases write as invalid on purpose. */
const areas = "Africa|America|Antarctica|Arctic|Asia|Atlantic|Australia|Europe|Indian|Pacific|Etc";
const written = new RegExp(`\\b(?:${areas})/[A-Za-z0-9_+-]+(?:/[A-Za-z0-9_+-]+)?`, "g");
/** Names that are not zones, written in the specification and cases to show an error. */
const notZones = new Set(["Europe/Londn"]);

describe("the zones in the specification, cases and kits", () => {
  const root = join(import.meta.dirname, "../../../..");
  const folders = [join(root, "spec"), join(root, "../standards/kits")];

  it("are on the list", () => {
    const names = folders
      .flatMap((folder) => filesIn(folder, [".md", ".yaml"]))
      .flatMap((file) => readFileSync(file, "utf8").match(written) ?? [])
      .filter((name) => !notZones.has(name));
    expect(names.length).toBeGreaterThan(0);
    expect(names.filter((name) => !isZone(name))).toEqual([]);
  });
});

describe("zoneAfter", () => {
  const contract = {
    columns: [
      { name: "id", logicalType: "integer" },
      { name: "a", logicalType: "timestamp" },
      { name: "b", logicalType: "timestamp" },
    ],
  } as unknown as Contract;

  it("is the input zone when nothing is converted", () => {
    expect(zoneAfter(contract, new Map(), "Europe/London")).toBe("Europe/London");
  });

  it("is the target when every timestamp column is converted to it", () => {
    const planned = new Map([
      ["a", { to: "UTC" }],
      ["b", { to: "UTC" }],
    ]);
    expect(zoneAfter(contract, planned, "Europe/London")).toBe("UTC");
  });

  it("is no zone when only some columns are converted", () => {
    expect(zoneAfter(contract, new Map([["a", { to: "UTC" }]]), "Europe/London")).toBeUndefined();
  });

  it("is the input zone for a table with no timestamp column", () => {
    const plain = { columns: [{ name: "id", logicalType: "integer" }] } as unknown as Contract;
    expect(zoneAfter(plain, new Map(), "UTC")).toBe("UTC");
  });
});
