import {
  Alert,
  Box,
  Button,
  Card,
  Container,
  Flex,
  Heading,
  IconButton,
  Link,
  Separator,
  Stack,
  Text,
} from "@chakra-ui/react";
import { Link as RouterLink, Outlet, useLocation } from "@tanstack/react-router";
import { ChevronsLeft, ChevronsRight, LayoutDashboard, Settings } from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useState } from "react";

import { BreadcrumbCurrentLink, BreadcrumbLink, BreadcrumbRoot } from "./components/ui/breadcrumb";
import { ColorModeButton } from "./components/ui/color-mode";
import {
  DialogActionTrigger,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from "./components/ui/dialog";

const SIDEBAR_COLLAPSED_KEY = "optimus.sidebar.collapsed";

const readSidebarCollapsed = () => {
  try {
    return globalThis.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
  } catch {
    return false;
  }
};

export function RootLayout() {
  const pathname = useLocation({ select: (location) => location.pathname });
  const isDashboard = pathname === "/";
  const isSettings = pathname === "/settings" || pathname.startsWith("/settings/");
  const [isCollapsed, setIsCollapsed] = useState(readSidebarCollapsed);

  const collapse = (next: boolean) => {
    setIsCollapsed(next);
    try {
      globalThis.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
    } catch {
      // Private mode and quota failures should not block collapse.
    }
  };

  return (
    <Flex minH="100vh" bg="bg.muted">
      <Flex
        as="nav"
        aria-label="Side navigation"
        direction="column"
        w={isCollapsed ? "16" : { base: "56", md: "60" }}
        bg="bg.panel"
        borderRightWidth="1px"
        borderColor="border"
        py="4"
        px={isCollapsed ? "2" : "3"}
        gap="4"
        flexShrink={0}
      >
        <Heading
          size="md"
          px={isCollapsed ? "0" : "2"}
          textAlign={isCollapsed ? "center" : "start"}
        >
          {isCollapsed ? "O" : "Optimus"}
        </Heading>
        <Stack gap="1" flex="1">
          <NavItem
            href="/"
            label="Dashboard"
            icon={<LayoutDashboard />}
            selected={isDashboard}
            collapsed={isCollapsed}
          />
          <NavItem
            href="/settings"
            label="Settings"
            icon={<Settings />}
            selected={isSettings}
            collapsed={isCollapsed}
          />
        </Stack>
        <Stack gap="2" align={isCollapsed ? "center" : "stretch"}>
          <ColorModeButton />
          <IconButton
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            variant="ghost"
            size="sm"
            onClick={() => collapse(!isCollapsed)}
          >
            {isCollapsed ? <ChevronsRight /> : <ChevronsLeft />}
          </IconButton>
        </Stack>
      </Flex>
      <Box flex="1" minW="0">
        <Container maxW="7xl" py={{ base: 4, md: 6 }} px={{ base: 4, md: 6 }}>
          <Stack gap="6">
            <Outlet />
          </Stack>
        </Container>
      </Box>
    </Flex>
  );
}

function NavItem({
  href,
  label,
  icon,
  selected,
  collapsed,
}: {
  readonly href: string;
  readonly label: string;
  readonly icon: ReactNode;
  readonly selected: boolean;
  readonly collapsed: boolean;
}) {
  return (
    <Link
      asChild
      borderRadius="md"
      px={collapsed ? "0" : "3"}
      py="2"
      color={selected ? "fg" : "fg.muted"}
      bg={selected ? "bg.muted" : "transparent"}
      fontWeight={selected ? "semibold" : "medium"}
      _hover={{ bg: "bg.muted", textDecoration: "none" }}
      aria-current={selected ? "page" : undefined}
      aria-label={collapsed ? label : undefined}
      title={collapsed ? label : undefined}
    >
      <RouterLink to={href} activeOptions={{ exact: href === "/" }}>
        <Flex align="center" justify={collapsed ? "center" : "flex-start"} gap="3">
          {icon}
          {collapsed ? null : <Text>{label}</Text>}
        </Flex>
      </RouterLink>
    </Link>
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
    <Flex justify="space-between" align="flex-start" gap="4" wrap="wrap">
      <Stack gap="1">
        <Heading as="h1" size="xl">
          {title}
        </Heading>
        {subtitle ? (
          <Text color="fg.muted" as="p">
            {subtitle}
          </Text>
        ) : null}
      </Stack>
      {action ? (
        <Flex gap="2" wrap="wrap" align="center">
          {action}
        </Flex>
      ) : null}
    </Flex>
  );
}

export type PageBreadcrumb = {
  readonly label: string;
  readonly href?: string;
};

export function PageBreadcrumbs({ items }: { readonly items: ReadonlyArray<PageBreadcrumb> }) {
  return (
    <BreadcrumbRoot aria-label="Breadcrumb">
      {items.map((item) =>
        item.href ? (
          <BreadcrumbLink key={item.href} asChild>
            <RouterLink to={item.href}>{item.label}</RouterLink>
          </BreadcrumbLink>
        ) : (
          <BreadcrumbCurrentLink key={item.label}>{item.label}</BreadcrumbCurrentLink>
        ),
      )}
    </BreadcrumbRoot>
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
      <Text color="fg.muted" as="p" role="status">
        Loading…
      </Text>
    );
  }
  return (
    <Alert.Root status="error">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>Something went wrong</Alert.Title>
        <Alert.Description>
          {message ?? "The engine could not complete this request."}
        </Alert.Description>
      </Alert.Content>
    </Alert.Root>
  );
}

export function ResourceCard({ children }: { readonly children: ReactNode }) {
  return (
    <Card.Root>
      <Card.Body>{children}</Card.Body>
    </Card.Root>
  );
}

export function FormFrame({
  children,
  onSubmit,
}: {
  readonly children: ReactNode;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} noValidate>
      <Stack maxW="xl" gap="4">
        {children}
      </Stack>
    </form>
  );
}

export function FormError({ message }: { readonly message: string | null }) {
  return message === null ? null : (
    <Alert.Root status="error">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>Could not save</Alert.Title>
        <Alert.Description>{message}</Alert.Description>
      </Alert.Content>
    </Alert.Root>
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
  const [open, setOpen] = useState(false);
  return (
    <Stack gap="4">
      <Separator />
      <Button colorPalette="red" variant="outline" onClick={() => setOpen(true)}>
        Delete {entity}
      </Button>
      <DialogRoot role="alertdialog" open={open} onOpenChange={(details) => setOpen(details.open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {entity}?</DialogTitle>
          </DialogHeader>
          <DialogBody>
            This permanently deletes the record and its dependent history. This action cannot be
            undone.
          </DialogBody>
          <DialogFooter>
            <DialogActionTrigger asChild>
              <Button variant="outline">Cancel</Button>
            </DialogActionTrigger>
            <Button
              colorPalette="red"
              loading={isPending}
              onClick={() => {
                void onDelete();
              }}
            >
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </DialogRoot>
    </Stack>
  );
}

export function NavRow({
  href,
  label,
  description,
  endContent,
}: {
  readonly href: string;
  readonly label: ReactNode;
  readonly description?: string;
  readonly endContent?: ReactNode;
}) {
  return (
    <Box as="li" listStyle="none" borderBottomWidth="1px" borderColor="border">
      <Flex justify="space-between" align="center" gap="4" py="3" px="1">
        <Link asChild flex="1" minW="0" _hover={{ textDecoration: "none" }}>
          <RouterLink to={href}>
            <Stack gap="0.5" minW="0">
              <Text fontWeight="semibold">{label}</Text>
              {description ? (
                <Text color="fg.muted" fontSize="sm">
                  {description}
                </Text>
              ) : null}
            </Stack>
          </RouterLink>
        </Link>
        {endContent}
      </Flex>
    </Box>
  );
}
