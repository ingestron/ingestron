// Shows one real file of a tested example; the build fails if it is missing.
import { ServerCodeBlock } from "fumadocs-ui/components/codeblock.rsc";
import { readExampleFile } from "@/lib/examples";

/** One file of an example, as it is in the repository. */
export function Example({ name, file }: { name: string; file: string }) {
  const extension = file.split(".").pop() ?? "text";
  return (
    <ServerCodeBlock
      code={readExampleFile(name, file).trimEnd()}
      lang={extension === "yml" ? "yaml" : extension}
      codeblock={{ title: `${name}/${file}`, className: "my-4" }}
    />
  );
}

/** A link to the whole example as a zip file. */
export function ExampleDownload({ name }: { name: string }) {
  return (
    <a className="download-button" download href={`/downloads/${name}.zip`}>
      ↓ Download {name}.zip
    </a>
  );
}
