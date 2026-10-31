import { connectorEntries } from "@/lib/reference";

const common = [
  ["Create a project", "/docs/how-to/start-from-a-template"],
  ["Standards and overrides", "/docs/how-to/configure-a-standard"],
];
const adf = [
  ["ADF runtime and scheduling", "/docs/how-to/adf-runtime"],
  ["ADF resource names", "/docs/how-to/name-adf-resources"],
  ["Publish ADF resources", "/docs/how-to/publish-adf"],
  ["Generate and inspect ADF", "/docs/how-to/adf-native-connectors#generate-and-inspect"],
];
const databricks = [
  ["Databricks names", "/docs/how-to/name-things-your-way"],
  ["Databricks schedules", "/docs/how-to/refresh-on-a-schedule"],
  ["Deploy Databricks", "/docs/how-to/deploy-the-bundle"],
];

/** Shared setup links beside connector chapters, or below them on small screens.
 * @example <RelatedSetup id="sqlserver" />
 */
export function RelatedSetup({ id }: { id: string }) {
  const hasAdf = connectorEntries(id).some((entry) => entry.pack === "adf");
  // ADF routes also generate a downstream Databricks table.
  const links = [...common, ...(hasAdf ? adf : []), ...databricks];
  return (
    <nav className="related-setup" aria-label="Related setup">
      <p>Related setup</p>
      <ul>
        {links.map(([title, href]) => (
          <li key={href}>
            <a href={href}>{title}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
