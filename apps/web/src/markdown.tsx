import { Heading, Link, List, Table, Text, chakra } from "@chakra-ui/react";
import type { ReactNode } from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const headingFor = (offset: number, level: 1 | 2 | 3 | 4 | 5 | 6) => {
  const tagLevel = Math.min(6, level + offset) as 1 | 2 | 3 | 4 | 5 | 6;
  const as = `h${tagLevel}` as const;
  const size = tagLevel <= 3 ? "md" : "sm";
  return function MarkdownHeading({ children }: { readonly children?: ReactNode }) {
    return (
      <Heading as={as} size={size} mt="4" mb="2">
        {children}
      </Heading>
    );
  };
};

const componentsFor = (headingLevelStart: number): Components => {
  const offset = Math.max(0, headingLevelStart - 1);
  return {
    h1: headingFor(offset, 1),
    h2: headingFor(offset, 2),
    h3: headingFor(offset, 3),
    h4: headingFor(offset, 4),
    h5: headingFor(offset, 5),
    h6: headingFor(offset, 6),
    p: ({ children }) => (
      <Text as="p" my="2">
        {children}
      </Text>
    ),
    a: ({ href, children }) => (
      <Link href={href} colorPalette="blue">
        {children}
      </Link>
    ),
    ul: ({ children }) => (
      <List.Root ps="5" my="2">
        {children}
      </List.Root>
    ),
    ol: ({ children }) => (
      <List.Root as="ol" ps="5" my="2">
        {children}
      </List.Root>
    ),
    li: ({ children }) => <List.Item>{children}</List.Item>,
    table: ({ children }) => (
      <Table.ScrollArea my="3">
        <Table.Root size="sm" variant="line">
          {children}
        </Table.Root>
      </Table.ScrollArea>
    ),
    thead: ({ children }) => <Table.Header>{children}</Table.Header>,
    tbody: ({ children }) => <Table.Body>{children}</Table.Body>,
    tr: ({ children }) => <Table.Row>{children}</Table.Row>,
    th: ({ children }) => <Table.ColumnHeader>{children}</Table.ColumnHeader>,
    td: ({ children }) => <Table.Cell>{children}</Table.Cell>,
    code: ({ children }) => (
      <chakra.code fontFamily="mono" fontSize="sm" bg="bg.muted" px="1" rounded="sm">
        {children}
      </chakra.code>
    ),
  };
};

export function Markdown({
  children,
  headingLevelStart = 1,
}: {
  readonly children: string;
  readonly headingLevelStart?: number;
}) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={componentsFor(headingLevelStart)}>
      {children}
    </ReactMarkdown>
  );
}
