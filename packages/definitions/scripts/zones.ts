// Writes src/data/zones.json: the time zone names the package accepts (specification
// section 6.3). The names come from the tz database that this Node.js runtime ships,
// through Intl.supportedValuesOf, with UTC and Etc/UTC. It records the database's version and
// the Node.js version, and uses no network. Run it with `pnpm zones` under Node.js 22.
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const names = new Set([...Intl.supportedValuesOf("timeZone"), "UTC", "Etc/UTC"]);
const zones = {
  tzdb: process.versions.tz,
  node: process.version,
  zones: [...names].sort(),
};
const file = join(import.meta.dirname, "../src/data/zones.json");
writeFileSync(file, `${JSON.stringify(zones, null, 2)}\n`);
console.log(
  `${zones.zones.length} zones from tz database ${zones.tzdb} (${zones.node}) in ${file}`,
);
