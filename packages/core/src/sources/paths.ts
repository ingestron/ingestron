// Where a file saved under `sources/` belongs (spec/cli/sources.md, section 3, "The object", and
// section 4, where the request saves each file).

/** The metadata document's own name, `<connection>.yaml` or `.yml`. */
const documentName = /^[^.]+\.ya?ml$/;

/** The path without the last extension of its last part: `exports/orders.v2.csv` is `exports/orders.v2`. */
function withoutExtension(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? path.slice(0, path.length - name.length + dot) : path;
}

/**
 * The connection a file saved under `sources/` belongs to and, for a file under
 * `sources/<connection>/`, the object it describes: the path below that folder without its last
 * extension only. A file directly in `sources/` belongs to the connection its name starts with,
 * up to the first `.`, as the source request names them (`sources/erp.catalog.csv`). Undefined
 * for the metadata document itself (`sources/<connection>.yaml` or `.yml`) and for a path outside
 * `sources/`. The path is relative to the project's folder, written with `/` (a `\` is read as
 * `/`, and a leading `./` is dropped, as the import does); a path that leaves the folder has
 * nothing of `sources/` in it.
 * @example
 * sourceFileFor("sources/landing/exports/orders.v2.csv") // { connection: "landing", object: "exports/orders.v2" }
 * sourceFileFor("sources/erp.catalog.csv")               // { connection: "erp" }
 * sourceFileFor("sources/erp.yaml")                      // undefined
 * @public
 */
export function sourceFileFor(path: string): { connection: string; object?: string } | undefined {
  const [top, first = "", ...rest] = projectPath(path).split("/");
  if (top !== "sources" || first === "") return undefined;
  if (rest.length > 0) {
    const below = rest.join("/");
    return below === "" ? undefined : { connection: first, object: withoutExtension(below) };
  }
  if (documentName.test(first)) return undefined;
  const dot = first.indexOf(".");
  return dot > 0 ? { connection: first.slice(0, dot) } : undefined;
}

/**
 * The object a file names by its path, when it is under `sources/<connection>/` for this
 * connection: the path below that folder without its last extension, or the whole path, as
 * written, when only it names one of the flows' objects (compared by `key`).
 */
export function objectFromPath(
  file: string,
  connection: string,
  flows?: { objects: readonly string[]; key: (object: string) => string },
): string | undefined {
  const found = sourceFileFor(file);
  if (found?.connection !== connection || found.object === undefined) return undefined;
  if (flows === undefined) return found.object;
  const read = new Set(flows.objects.map(flows.key));
  const whole = projectPath(file).slice(`sources/${connection}/`.length);
  return !read.has(flows.key(found.object)) && read.has(flows.key(whole)) ? whole : found.object;
}

/** True when the file is the connection's metadata document, `sources/<connection>.yaml` or `.yml`. */
export function isDocumentOf(file: string, connection: string): boolean {
  return file === `sources/${connection}.yaml` || file === `sources/${connection}.yml`;
}

/**
 * The path the import records and reads by: relative to the project's folder, written with `/`
 * (a Windows `\` too) and without a leading `./`; a path that leaves the folder (absolute, a
 * drive such as `C:` included, or with a `..` part) is only the file's name.
 */
export function projectPath(file: string): string {
  const parts = file.split(/[\\/]/).filter((part) => part !== "." && part !== "");
  const outside = /^([\\/]|[A-Za-z]:)/.test(file) || parts.includes("..");
  return outside ? (parts.at(-1) ?? file) : parts.join("/");
}
