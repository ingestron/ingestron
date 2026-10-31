// Discovery uses the same metadata as the CLI and New project wizard.
import { projectSources, projectRoutes } from "@ingestron/cli";

/** Source categories with links to connection settings and supported routes.
 * @example <ProjectSources category="Databases and analytics" />
 */
export function ProjectSources({ category }: { category?: string }) {
  const sources = projectSources();
  if (category)
    return <SourceList sources={sources.filter((source) => source.category === category)} />;
  const categories = [...new Set(sources.map((source) => source.category))];
  return (
    <div>
      {categories.map((name) => (
        <details key={name}>
          <summary>{name}</summary>
          <SourceList sources={sources.filter((source) => source.category === name)} />
        </details>
      ))}
    </div>
  );
}

function SourceList({ sources }: { sources: ReturnType<typeof projectSources> }) {
  return (
    <ul className="source-list">
      {sources.map((source) => (
        <li key={source.id}>
          <a href={`/docs/connectors/${source.id}`}>{source.title}</a>
          <span>
            {projectRoutes(source.id)
              .map((route) => `${route.title}: ${route.connectivity.join(", ")}`)
              .join(" · ")}
          </span>
        </li>
      ))}
    </ul>
  );
}
