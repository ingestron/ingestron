import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";
import { NamingVariables } from "@/components/reference/naming-variables";
import { DocLinks } from "@/components/doc-links";
import { Example, ExampleDownload } from "@/components/example";
import { FlowDiagram } from "@/components/flow-diagram";
import { RouteComparison } from "@/components/reference/route-comparison";
import { ProjectSources } from "@/components/reference/project-sources";
import { BuiltInTemplates } from "@/components/reference/built-in-templates";
import { CliCommands } from "@/components/reference/cli-commands";
import { ConnectorSettings } from "@/components/reference/connector-settings";
import { ConnectorFacts } from "@/components/reference/connector-facts";
import { ContractUseTable } from "@/components/reference/contract-use";
import { PackCapabilities } from "@/components/reference/pack-capabilities";
import { SamplesCatalogue } from "@/components/reference/samples-catalogue";
import { ContractFields, DocumentFields } from "@/components/reference/document-fields";
import { ErrorCodes, LoadingCodes } from "@/components/reference/error-codes";
import { ExtensionCommands } from "@/components/reference/extension-commands";
import { ExamplesList } from "@/components/reference/examples-list";
import { PackMethods } from "@/components/reference/pack-methods";
import { NativeReadSettings } from "@/components/reference/native-read-settings";
import { SettingsSections } from "@/components/reference/settings-sections";
import { SettingsTable } from "@/components/reference/settings-table";
import { Tool, ToolSteps } from "@/components/tool-steps";

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    NamingVariables,
    DocLinks,
    Example,
    ExampleDownload,
    Tool,
    ToolSteps,
    SettingsTable,
    SettingsSections,
    NativeReadSettings,
    PackMethods,
    ConnectorFacts,
    ConnectorSettings,
    ContractUseTable,
    PackCapabilities,
    SamplesCatalogue,
    ErrorCodes,
    LoadingCodes,
    DocumentFields,
    ContractFields,
    CliCommands,
    BuiltInTemplates,
    ProjectSources,
    FlowDiagram,
    RouteComparison,
    ExamplesList,
    ExtensionCommands,
    ...components,
  } satisfies MDXComponents;
}
export const useMDXComponents = getMDXComponents;
declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
