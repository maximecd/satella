import { Button, Flex, Heading, Icon, Link, Stack, Text } from "@chakra-ui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link as RouterLink, useLocation } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Lock,
  Receipt,
  Settings,
  Target,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { engineApi } from "./api";
import { vaultStatusQuery } from "./queries";

export function Sidebar() {
  const { t } = useTranslation();
  const pathname = useLocation({ select: (location) => location.pathname });
  const isDashboard = pathname === "/";
  const isAccounts = pathname === "/accounts" || pathname.startsWith("/accounts/");
  const isDebts = pathname === "/debts" || pathname.startsWith("/debts/");
  const isGoals = pathname === "/goals" || pathname.startsWith("/goals/");
  const isSettings = pathname === "/settings" || pathname.startsWith("/settings/");

  return (
    <Flex
      as="nav"
      aria-label={t("shell.sideNavigation")}
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
        <NavItem
          href="/"
          label={t("shell.dashboard")}
          icon={LayoutDashboard}
          selected={isDashboard}
        />
        <NavItem href="/accounts" label={t("shell.accounts")} icon={Wallet} selected={isAccounts} />
        <NavItem href="/debts" label={t("shell.debts")} icon={Receipt} selected={isDebts} />
        <NavItem href="/goals" label={t("shell.goals")} icon={Target} selected={isGoals} />
        <NavItem
          href="/settings"
          label={t("shell.settings")}
          icon={Settings}
          selected={isSettings}
        />
      </Stack>
      <LockButton />
    </Flex>
  );
}

function LockButton() {
  const { t } = useTranslation();
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
      {t("shell.lock")}
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
