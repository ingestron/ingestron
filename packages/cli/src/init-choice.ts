// Source choices are small prompts over the same catalogue the editor consumes.
import type { Options } from "./args.js";
import { projectRoutes, projectSources } from "./project-choices.js";
import { projectRecipe } from "./project-recipes.js";
/** The existing init question contract. */
export type Ask = (
  question: string,
  flag: string,
  fallback: string,
  check?: (answer: string) => string | undefined,
) => string;
/** Select a connector, reachable network and compatible ingestion route. */
export function chooseProject(flags: Options["init"], ask: Ask) {
  const sources = projectSources();
  let connector = flags.connector;
  if (!connector) {
    const categories = [...new Set(sources.map((source) => source.category))];
    const category = choose("Source category", categories, "Files and storage", "--connector", ask);
    connector = choose(
      "Connector",
      sources.filter((source) => source.category === category).map((source) => source.id),
      category === "Files and storage" ? "files" : "",
      "--connector",
      ask,
    );
  }
  if (!sources.some((source) => source.id === connector))
    throw new Error(`Unknown connector "${connector}".`);
  const available = projectRoutes(connector);
  const networks = [...new Set(available.flatMap((route) => route.connectivity))];
  const preferred = available.some((route) => route.via === "databricks")
    ? connector === "sqlserver"
      ? "workspace"
      : "public"
    : "private";
  const connectivity =
    flags.connectivity ?? choose("Connectivity", networks, preferred, "--connectivity", ask);
  const routes = projectRoutes(connector, connectivity);
  if (!routes.length)
    throw new Error(`No route for ${connector} with ${connectivity} connectivity.`);
  const via =
    flags.via ??
    choose(
      `Route (${routes.map((route) => `${route.via}: ${route.title}, ${route.maturity}`).join("; ")})`,
      routes.map((route) => route.via),
      routes[0]!.via,
      "--via",
      ask,
    );
  return { ...projectRecipe(connector, via, connectivity), done: () => {} };
}
function choose(title: string, values: string[], fallback: string, flag: string, ask: Ask): string {
  if (values.length === 1) return values[0]!;
  const normalise = (answer: string) =>
    /^\d+$/.test(answer) ? (values[Number(answer) - 1] ?? answer) : answer;
  const prompt = `${title}:\n${values.map((value, index) => `  ${index + 1}. ${value}`).join("\n")}\nChoice [${fallback || values[0]}]: `;
  return normalise(
    ask(prompt, flag, fallback || values[0]!, (answer) =>
      values.includes(normalise(answer)) ? undefined : `Choose one of: ${values.join(", ")}.`,
    ),
  );
}
