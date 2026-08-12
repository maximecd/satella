import { AppShell } from "@astryxdesign/core/AppShell";
import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { colorVars } from "@astryxdesign/core/theme/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { Link, Outlet } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useState } from "react";

const styles = stylex.create({
  shell: { backgroundColor: colorVars["--color-background-body"] },
  navigation: {
    alignItems: "center",
    display: "flex",
    gap: 12,
    justifyContent: "space-between",
    padding: "12px 24px",
  },
  navLinks: { display: "flex", gap: 8 },
  main: { margin: "0 auto", maxWidth: 1040, width: "100%" },
  pageHeader: {
    alignItems: "center",
    display: "flex",
    gap: 16,
    justifyContent: "space-between",
    marginBottom: 24,
  },
  heading: { color: colorVars["--color-text-primary"], margin: 0 },
  muted: { color: colorVars["--color-text-secondary"] },
  stack: { display: "flex", flexDirection: "column", gap: 12 },
  row: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "space-between",
  },
  form: { display: "flex", flexDirection: "column", gap: 16, maxWidth: 560 },
  table: { borderCollapse: "collapse", width: "100%" },
  cell: {
    borderBottom: `1px solid ${colorVars["--color-border"]}`,
    padding: "12px 8px",
    textAlign: "left",
  },
  numeric: { fontVariantNumeric: "tabular-nums", textAlign: "right" },
  link: { color: colorVars["--color-text-accent"], textDecoration: "none" },
});

export { styles };

export function RootLayout() {
  const topNav = (
    <header {...stylex.props(styles.navigation)}>
      <strong>Optimus</strong>
      <nav {...stylex.props(styles.navLinks)} aria-label="Primary navigation">
        <Button as={Link} href="/custodians" label="Custodians" variant="ghost" />
        <Button as={Link} href="/assets" label="Assets" variant="ghost" />
      </nav>
    </header>
  );
  return (
    <AppShell
      topNav={topNav}
      contentPadding={4}
      height="auto"
      mobileNav={false}
      xstyle={styles.shell}
    >
      <div {...stylex.props(styles.main)}>
        <Outlet />
      </div>
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
    <div {...stylex.props(styles.pageHeader)}>
      <div>
        <h1 {...stylex.props(styles.heading)}>{title}</h1>
        {subtitle && <p {...stylex.props(styles.muted)}>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageState({
  kind,
  message,
}: {
  readonly kind: "pending" | "error";
  readonly message?: string;
}) {
  if (kind === "pending") return <p role="status">Loading…</p>;
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
    <>
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
    </>
  );
}
