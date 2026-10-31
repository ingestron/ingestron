// Steps that differ between the CLI, VS Code and Studio. With one tool there
// are no tabs; the reader's choice is remembered across pages.
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { Tab, Tabs } from "fumadocs-ui/components/tabs";

type ToolProps = { name: string; children: ReactNode };

/** The steps for one tool, inside `<ToolSteps>`. */
export function Tool({ children }: ToolProps) {
  return <>{children}</>;
}

/** Tabs for each tool's steps, or the steps alone when only one tool can do the task. */
export function ToolSteps({ children }: { children: ReactNode }) {
  const tools = Children.toArray(children).filter(isValidElement) as ReactElement<ToolProps>[];
  if (tools.length === 1) return <>{tools[0]!.props.children}</>;
  return (
    <Tabs groupId="tool" persist items={tools.map((tool) => tool.props.name)}>
      {tools.map((tool) => (
        <Tab key={tool.props.name} value={tool.props.name}>
          {tool.props.children}
        </Tab>
      ))}
    </Tabs>
  );
}
