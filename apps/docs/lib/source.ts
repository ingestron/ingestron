import { docs } from "collections/server";
import { loader } from "fumadocs-core/source";
import { connectionNavigation } from "./connection-navigation";

export const source = loader({
  baseUrl: "/docs",
  pageTree: { transformers: [connectionNavigation] },
  source: docs.toFumadocsSource(),
});
