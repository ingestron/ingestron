import type { ExampleInfo } from "@/lib/examples";
import { ExamplesList } from "./examples-list";

/** Downloads with platforms and scope, using the same cards as connector examples.
 * @example <SamplesCatalogue kind="starter" />
 */
export function SamplesCatalogue({ kind }: { kind: ExampleInfo["kind"] }) {
  return <ExamplesList kind={kind} />;
}
