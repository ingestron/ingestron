// The documentation pages the editor links to: each field and setting, and
// each problem code. The docs site checks that every one of them exists.
import { packs } from "@ingestron/cli";
import {
  codeHelp,
  documentReference,
  loadingCodeHelp,
  methodReference,
  referenceKinds,
} from "@ingestron/definitions";

/** The errors page entry for a problem code, if the code is documented there. */
export function codeDocs(code: string): string | undefined {
  return code in codeHelp || code in loadingCodeHelp ? `/docs/reference/errors#${code}` : undefined;
}

/** Every documentation link the editor can show, once each. */
export function docsLinks(): string[] {
  const fields = [
    ...Object.keys(referenceKinds).flatMap((kind) =>
      documentReference(kind as keyof typeof referenceKinds),
    ),
    ...packs.flatMap((pack) =>
      Object.keys(pack.methods).flatMap((id) => methodReference(pack, id)),
    ),
  ].map((field) => field.docs);
  const methods = packs.flatMap((pack) =>
    Object.keys(pack.methods).map((id) => `/docs/reference/packs/${pack.id}#${id}`),
  );
  const codes = [...Object.keys(codeHelp), ...Object.keys(loadingCodeHelp)].map(
    (code) => `/docs/reference/errors#${code}`,
  );
  return [...new Set([...fields, ...methods, ...codes])];
}

/** A link on the docs site at `base`, such as https://docs.ingestron.io. */
export function docsUrl(base: string, link: string): string {
  return `${base.replace(/\/+$/, "")}${link}`;
}
