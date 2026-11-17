// Time zone names (specification section 6.3): the IANA zones a definition may use.
import { zones as zoneList } from "../data/index.js";

const zones: ReadonlySet<string> = new Set(zoneList.names);

/** True when the name is on the list of IANA zones the package ships, written exactly. */
export function isZone(name: string): boolean {
  return zones.has(name);
}

/** The zone on the list written like `name` but for case, or undefined when there is none. */
export function zoneLike(name: string): string | undefined {
  return zoneList.names.find((zone) => zone.toLowerCase() === name.toLowerCase());
}
