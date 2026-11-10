// Writes src/data/zones.json: the time zone names the package accepts (specification
// section 6.3). The names are the union of three sources: the tz database that this Node.js
// runtime ships (Intl.supportedValuesOf), the zone files of the operating system's tz database
// tree (/usr/share/zoneinfo), where Node.js accepts the name, which adds the aliases the runtime
// does not list (Asia/Kolkata, GMT, Etc/GMT+5), and UTC with Etc/UTC. It records the versions
// of the sources, and uses no network. Run it with `pnpm zones` under Node.js 22.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const tree = "/usr/share/zoneinfo";
/** Files of the tree that are not zones. */
const skipped = /^(\+.*|posixrules|leapseconds|tzdata\.zi|SECURITY|.*\.tab|.*\.zi|localtime)$/;

/** True when Node.js accepts the name as a zone. */
function accepted(name: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: name });
    return true;
  } catch {
    return false;
  }
}

/** True for a file that begins as a compiled zone does. */
function isZoneFile(path: string): boolean {
  return readFileSync(path).subarray(0, 4).toString("latin1") === "TZif";
}

/** The names of the zone files under `folder`, relative to the tree. */
function treeNames(folder: string, prefix = ""): string[] {
  if (!existsSync(folder)) return [];
  return readdirSync(folder).flatMap((entry) => {
    const path = join(folder, entry);
    const name = prefix + entry;
    if (skipped.test(entry) || ["posix", "right"].includes(name)) return [];
    if (statSync(path).isDirectory()) return treeNames(path, `${name}/`);
    return isZoneFile(path) ? [name] : [];
  });
}

const versionFile = join(tree, "+VERSION");
const osVersion = existsSync(versionFile) ? readFileSync(versionFile, "utf8").trim() : null;
const names = new Set([
  ...Intl.supportedValuesOf("timeZone"),
  ...treeNames(tree).filter(accepted),
  "UTC",
  "Etc/UTC",
]);
const zones = {
  tzdb: process.versions.tz,
  node: process.version,
  osTzdata: osVersion,
  zones: [...names].sort(),
};
const file = join(import.meta.dirname, "../src/data/zones.json");
writeFileSync(file, `${JSON.stringify(zones, null, 2)}\n`);
console.log(
  `${zones.zones.length} zones: tz database ${zones.tzdb} (${zones.node}), ${tree} ${osVersion ?? "no version"}`,
);
