// Every internal link, download and image in the built site points at a file
// that exists, and every documentation link the editor shows lands on its page
// and anchor.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { docsLinks } from "@ingestron/authoring";
import { join } from "node:path";

const out = join(process.cwd(), "out");
const broken = new Set<string>();
for (const page of htmlFiles(out)) {
  for (const [, href] of readFileSync(page, "utf8").matchAll(/(?:href|src)="(\/[^"#?]*)/g)) {
    if (!href!.startsWith("/_next/") && !exists(href!))
      broken.add(`${page.slice(out.length)} → ${href}`);
  }
}
for (const link of docsLinks()) {
  const [path = "", anchor] = link.split("#");
  const page = [`${join(out, path)}.html`, join(out, path, "index.html")].find(existsSync);
  if (!page) broken.add(`editor link → ${link} (no page)`);
  else if (anchor && !readFileSync(page, "utf8").includes(`id="${anchor}"`))
    broken.add(`editor link → ${link} (no anchor)`);
}
if (broken.size > 0) {
  console.log(`✗ ${broken.size} broken links:\n${[...broken].join("\n")}`);
  process.exit(1);
}
console.log(`✓ every internal link resolves, and all ${docsLinks().length} editor links land`);

function exists(href: string): boolean {
  const path = join(out, href);
  return [path, `${path}.html`, join(path, "index.html")].some(
    (candidate) => existsSync(candidate) && statSync(candidate).isFile(),
  );
}

function htmlFiles(folder: string): string[] {
  return readdirSync(folder).flatMap((entry) => {
    const path = join(folder, entry);
    if (statSync(path).isDirectory()) return htmlFiles(path);
    return path.endsWith(".html") ? [path] : [];
  });
}
