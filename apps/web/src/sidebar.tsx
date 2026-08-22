import { Button, Flex, Heading, Icon, Link, Stack, Text } from "@chakra-ui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link as RouterLink, useLocation } from "@tanstack/react-router";
import { LayoutDashboard, Lock, Settings, type LucideIcon } from "lucide-react";

import { engineApi } from "./api";
import { vaultStatusQuery } from "./queries";

export function Sidebar() {
  const pathname = useLocation({ select: (location) => location.pathname });
  const isDashboard = pathname === "/";
  const isSettings = pathname === "/settings" || pathname.startsWith("/settings/");

  return (
    <Flex
      as="nav"
      aria-label="Side navigation"
      direction="column"
      w={{ base: "56", md: "60" }}
      bg="bg.panel"
      borderRightWidth="1px"
      borderColor="border"
      py="4"
      px="3"
      gap="4"
      h="full"
      overflowY="auto"
      flexShrink={0}
    >
      <Heading size="md" px="2">
        Satella
      </Heading>
      <Stack gap="1" flex="1">
        <NavItem href="/" label="Dashboard" icon={LayoutDashboard} selected={isDashboard} />
        <NavItem href="/settings" label="Settings" icon={Settings} selected={isSettings} />
      </Stack>
      <LockButton />
    </Flex>
  );
}

function LockButton() {
  const queryClient = useQueryClient();
  const lock = useMutation({
    mutationFn: engineApi.lockScreen,
    onSuccess: (status) => queryClient.setQueryData(vaultStatusQuery.queryKey, status),
  });
  return (
    <Button
      variant="ghost"
      width="full"
      justifyContent="flex-start"
      gap="3"
      px="3"
      py="2"
      h="auto"
      color="fg.muted"
      fontWeight="medium"
      onClick={() => lock.mutate()}
      loading={lock.isPending}
    >
      <Icon asChild>
        <Lock />
      </Icon>
      Lock
    </Button>
  );
}

function NavItem({
  href,
  label,
  icon: Glyph,
  selected,
}: {
  readonly href: string;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly selected: boolean;
}) {
  return (
    <Link
      asChild
      borderRadius="md"
      px="3"
      py="2"
      color={selected ? "fg" : "fg.muted"}
      bg={selected ? "bg.muted" : "transparent"}
      fontWeight={selected ? "semibold" : "medium"}
      _hover={{ bg: "bg.muted", textDecoration: "none" }}
      aria-current={selected ? "page" : undefined}
    >
      <RouterLink to={href} activeOptions={{ exact: href === "/" }}>
        <Flex align="center" gap="3">
          <Icon asChild>
            <Glyph />
          </Icon>
          <Text>{label}</Text>
        </Flex>
      </RouterLink>
    </Link>
  );
}
