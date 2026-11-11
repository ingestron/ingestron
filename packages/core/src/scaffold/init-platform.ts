// The shared infrastructure of a connection-first project: per environment, the storage
// account and Key Vault in project.yaml, composed into the platform's URLs; the standard's
// packs and schedule (spec/cli/projects.md, "REPLACE_ME" and "Written defaults").
import { isMap, isScalar } from "yaml";
import {
  commentAfter,
  commentText,
  editYaml,
  inFlow,
  replaceMe,
  setWithComment,
  type YamlDocument,
} from "./init-yaml.js";
import type { Composing } from "./init-compose.js";
import { packs } from "../packs/index.js";
import type { Content } from "./scaffold.js";

/** A route's facts for composing: its ingest method and its settings schema, and its packs. */
export interface Route {
  /** The route's name, such as `databricks` or `adf-databricks`. */
  via: string;
  method: string;
  packs: string[];
  /** Why the standard names these packs, beside them. */
  packsComment: string;
}

/** The values each environment gives in project.yaml, with the comment above each. */
const perEnvironment = {
  storage_account: "Storage account (ADLS Gen2) that the landing folder is in: its name",
  key_vault: "Key Vault that holds the source's secrets: its name, not its URL",
};

const storage = (container: string) =>
  `abfss://${container}@\${values.storage_account}.dfs.core.windows.net`;

/**
 * The settings schema of a method of any pack, by the method's id.
 * @internal
 */
export function methodSettings(method: string): Record<string, { description?: string }> {
  const found = packs.map((pack) => pack.methods[method]).find(Boolean);
  const schema = found?.settings as { properties?: Record<string, { description?: string }> };
  return schema?.properties ?? {};
}

type PerEnvironment = keyof typeof perEnvironment;

const at = (method: string, key: string) => ["settings", method, key];

const describe = (method: string, key: string) => methodSettings(method)[key]?.description ?? key;

/** Composes the platform's method settings, and the values they read in project.yaml. */
export function composePlatform(
  files: Record<string, Content>,
  route: Route,
  composing: Composing,
): void {
  const used = new Set<PerEnvironment>();
  editYaml(files, "platform.yaml", (document) => {
    document.set("id", composing.project);
    composeInfrastructure(document, route.method, composing.project, used);
    for (const [method, key, container] of [
      ["synapse-view", "data_source_location", "landing"],
      ["duckdb-table", "published", "published"],
    ] as const)
      if (typeof document.getIn(at(method, key)) === "string" && used.has("storage_account"))
        setWithComment(document, at(method, key), storage(container), describe(method, key));
  });
  editYaml(files, "project.yaml", (document) => {
    for (const environment of composing.environments)
      for (const name of used)
        setWithComment(
          document,
          ["environments", environment, "values", name],
          replaceMe,
          perEnvironment[name],
        );
  });
}

/** The ingest method's landing folder, Key Vault and integration runtime; `used` gains the values they read. */
function composeInfrastructure(
  document: YamlDocument,
  method: string,
  project: string,
  used: Set<PerEnvironment>,
): void {
  const landing = String(document.getIn(at(method, "landing")) ?? "");
  const container = /^abfss:\/\/([^@/]+)@/.exec(landing)?.[1];
  if (container) {
    used.add("storage_account");
    const comment = `Landing folder: the ${container} container of each environment's storage account`;
    setWithComment(document, at(method, "landing"), `${storage(container)}/${project}`, comment);
  }
  if (typeof document.getIn(at(method, "key_vault")) === "string") {
    used.add("key_vault");
    setWithComment(
      document,
      at(method, "key_vault"),
      "https://${values.key_vault}.vault.azure.net",
    );
  }
  if (typeof document.getIn(at(method, "integration_runtime")) === "string")
    setWithComment(
      document,
      at(method, "integration_runtime"),
      replaceMe,
      describe(method, "integration_runtime"),
    );
}

/** The standard's id, its packs with why, and the window's size with what it is. */
export function composeStandard(
  files: Record<string, Content>,
  route: Route,
  { project }: Composing,
): void {
  editYaml(files, "standard.yaml", (document) => {
    document.set("id", project);
    commentAfter(document, ["packs"], route.packsComment);
    const keys = ["ingest", "settings", route.method, "every"];
    const every = document.getIn(keys) as { toJSON?(): unknown } | undefined;
    if (!every) return;
    const size = windowSize(every.toJSON?.());
    const described = methodSettings(route.method).every?.description ?? "Window size";
    setWithComment(document, keys, document.getIn(keys, true), `${commentText(described)}${size}`);
    inFlow(document, keys);
  });
}

/** `: one window every 24 hours`, for an `every` of a frequency and an interval. */
function windowSize(every: unknown): string {
  const { frequency, interval } = (every ?? {}) as { frequency?: unknown; interval?: unknown };
  if (typeof frequency !== "string" || typeof interval !== "number") return "";
  const unit = frequency.toLowerCase();
  return `: one window every ${interval} ${unit}${interval === 1 ? "" : "s"}`;
}

/**
 * Databricks reads what Data Factory lands on a schedule of its own: without one, its
 * pipelines run only when someone starts them. Hourly, in UTC.
 */
export function composeSchedule(files: Record<string, Content>, route: Route): void {
  if (!route.packs.includes("databricks@2") || !route.packs.includes("adf@2")) return;
  editYaml(files, "platform.yaml", (document) => {
    if (document.has("schedule")) return;
    const schedule = document.createNode({ cron: "0 30 * * * ?", timezone: "UTC" }, { flow: true });
    setWithComment(
      document,
      ["schedule"],
      schedule,
      "Databricks refreshes hourly, at half past, to read the files Data Factory lands",
    );
  });
}

/**
 * Each ingest method's first window, in the standard, starts at midnight UTC on the day
 * `init` runs, so a new trigger does not run every window since an example's date.
 */
export function startToday(files: Record<string, Content>, today: string, asWritten = false): void {
  editYaml(
    files,
    "standard.yaml",
    (document) => {
      const settings = document.getIn(["ingest", "settings"]);
      if (!isMap(settings)) return;
      for (const pair of settings.items) {
        const method = String(isScalar(pair.key) ? pair.key.value : pair.key);
        const keys = ["ingest", "settings", method, "start"];
        if (!/^\d{4}-\d{2}-\d{2}T/.test(String(document.getIn(keys) ?? ""))) continue;
        const described =
          methodSettings(method).start?.description ?? "Start of the first window (UTC)";
        const start = described.split(", such as")[0]!;
        setWithComment(
          document,
          keys,
          `${today}T00:00:00Z`,
          commentText(`${start}: midnight on the day this project was created`),
        );
      }
    },
    asWritten,
  );
}
