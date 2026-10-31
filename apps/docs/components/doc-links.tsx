interface LinkItem {
  title: string;
  href: string;
  description: string;
}

/** Compact task links for section landing pages.
 * @example <DocLinks items={[{ title: "Plan and generate", href: "/docs/how-to/plan-and-generate", description: "Review changes before writing files." }]} />
 */
export function DocLinks({
  items,
  label = "Explore this section",
}: {
  items: LinkItem[];
  label?: string;
}) {
  return (
    <nav className="doc-links" aria-label={label}>
      {items.map(({ title, href, description }) => (
        <a key={href} href={href}>
          <strong>
            {title}
            <span aria-hidden="true"> →</span>
          </strong>
          <span>{description}</span>
        </a>
      ))}
    </nav>
  );
}
