import { AppShell } from "@astryxdesign/core/AppShell";
import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { Banner } from "@astryxdesign/core/Banner";
import { BreadcrumbItem, Breadcrumbs } from "@astryxdesign/core/Breadcrumbs";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Divider } from "@astryxdesign/core/Divider";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { Heading } from "@astryxdesign/core/Heading";
import { Layout } from "@astryxdesign/core/Layout";
import { SideNav, SideNavHeading, SideNavItem, SideNavSection } from "@astryxdesign/core/SideNav";
import { Stack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Link as RouterLink, Outlet, useLocation } from "@tanstack/react-router";
import type { FormEvent, ReactNode } from "react";
import { useState } from "react";

export function RootLayout() {
  const pathname = useLocation({ select: (location) => location.pathname });
  const isSelected = (path: string) => pathname === path || pathname.startsWith(`${path}/`);

  const navigation = (
    <SideNav
      collapsible={{ buttonLabel: "Collapse navigation" }}
      header={<SideNavHeading heading="Optimus" subheading="Finance workspace" />}
    >
      <SideNavSection title="Workspace">
        <SideNavItem
          as={RouterLink}
          href="/custodians"
          icon="wrench"
          selectedIcon="wrench"
          label="Custodians"
          isSelected={isSelected("/custodians")}
        />
        <SideNavItem
          as={RouterLink}
          href="/assets"
          icon="search"
          selectedIcon="search"
          label="Assets"
          isSelected={isSelected("/assets")}
        />
      </SideNavSection>
    </SideNav>
  );

  return (
    <AppShell height="auto" variant="elevated" contentPadding={4} sideNav={navigation}>
      <Layout height="auto" contentWidth={960} padding={0}>
        <Stack gap={6} padding={4}>
          <Outlet />
        </Stack>
      </Layout>
    </AppShell>
  );
}

export function PageHeader({
  title,
  action,
  subtitle,
}: {
  readonly title: string;
  readonly action?: ReactNode;
  readonly subtitle?: string;
}) {
  return (
    <Stack direction="horizontal" justify="between" align="start" gap={4} wrap="wrap">
      <Stack gap={1}>
        <Heading level={1}>{title}</Heading>
        {subtitle && (
          <Text type="supporting" as="p">
            {subtitle}
          </Text>
        )}
      </Stack>
      {action && (
        <Stack direction="horizontal" gap={2} wrap="wrap" align="center">
          {action}
        </Stack>
      )}
    </Stack>
  );
}

export type PageBreadcrumb = {
  readonly label: string;
  readonly href?: string;
};

export function PageBreadcrumbs({ items }: { readonly items: ReadonlyArray<PageBreadcrumb> }) {
  return (
    <Breadcrumbs variant="supporting" label="Breadcrumb">
      {items.map((item) =>
        item.href ? (
          <BreadcrumbItem key={item.href} as={RouterLink} href={item.href}>
            {item.label}
          </BreadcrumbItem>
        ) : (
          <BreadcrumbItem key={item.label} isCurrent>
            {item.label}
          </BreadcrumbItem>
        ),
      )}
    </Breadcrumbs>
  );
}

export function PageState({
  kind,
  message,
}: {
  readonly kind: "pending" | "error";
  readonly message?: string;
}) {
  if (kind === "pending") {
    return (
      <Text type="supporting" as="p" role="status">
        Loading…
      </Text>
    );
  }
  return (
    <Banner
      status="error"
      title="Something went wrong"
      description={message ?? "The engine could not complete this request."}
    />
  );
}

export function ResourceCard({ children }: { readonly children: ReactNode }) {
  return <Card padding={4}>{children}</Card>;
}

export function FormFrame({
  children,
  onSubmit,
}: {
  readonly children: ReactNode;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit}>
      <Stack maxWidth={640}>
        <FormLayout>{children}</FormLayout>
      </Stack>
    </form>
  );
}

export function FormError({ message }: { readonly message: string | null }) {
  return message === null ? null : (
    <Banner status="error" title="Could not save" description={message} />
  );
}

export function DeleteButton({
  entity,
  onDelete,
  isPending = false,
}: {
  readonly entity: string;
  readonly onDelete: () => void | Promise<void>;
  readonly isPending?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <Stack gap={4}>
      <Divider />
      <Button label={`Delete ${entity}`} variant="destructive" onClick={() => setIsOpen(true)} />
      <AlertDialog
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        title={`Delete ${entity}?`}
        description="This permanently deletes the record and its dependent history. This action cannot be undone."
        actionLabel="Delete permanently"
        isActionLoading={isPending}
        onAction={onDelete}
      />
    </Stack>
  );
}
