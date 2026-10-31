import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/layouts/docs/page";
import { getMDXComponents } from "@/components/mdx";
import { RelatedSetup } from "@/components/reference/related-setup";
import { connectorEntries } from "@/lib/reference";
import { source } from "@/lib/source";
export default async function Page({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (!page) notFound();
  const MDX = page.data.body;
  const id = slug?.[0] === "connectors" ? slug[1] : undefined;
  const related = id && connectorEntries(id).length ? <RelatedSetup id={id} /> : undefined;
  return (
    <DocsPage toc={page.data.toc} tableOfContent={{ footer: related }}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription className="mb-2">{page.data.description}</DocsDescription>
      <DocsBody>
        <MDX components={getMDXComponents()} />
      </DocsBody>
      {related && <div className="related-setup-mobile">{related}</div>}
    </DocsPage>
  );
}
export function generateStaticParams() {
  return source.generateParams();
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (!page) notFound();
  return {
    title: page.data.title,
    description: page.data.description,
    alternates: { canonical: page.url },
  };
}
