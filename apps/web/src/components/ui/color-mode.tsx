"use client";

import { ThemeProvider, useTheme } from "next-themes";
import type { ThemeProviderProps } from "next-themes";

export interface ColorModeProviderProps extends ThemeProviderProps {}

export function ColorModeProvider(props: ColorModeProviderProps) {
  return (
    <ThemeProvider
      attribute="class"
      disableTransitionOnChange
      enableSystem
      defaultTheme="system"
      {...props}
    />
  );
}

export type ThemePreference = "system" | "light" | "dark";

interface ThemePreferenceState {
  readonly theme: ThemePreference;
  readonly setTheme: (theme: ThemePreference) => void;
}

const isThemePreference = (value: string | undefined): value is ThemePreference =>
  value === "system" || value === "light" || value === "dark";

export function useThemePreference(): ThemePreferenceState {
  const { theme, setTheme } = useTheme();
  return {
    theme: isThemePreference(theme) ? theme : "system",
    setTheme,
  };
}
