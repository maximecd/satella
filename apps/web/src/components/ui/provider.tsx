import { ChakraProvider } from "@chakra-ui/react";

import { system } from "../../theme";
import { ColorModeProvider, type ColorModeProviderProps } from "./color-mode";
import { Toaster } from "./toaster";

export function Provider({ children, ...props }: ColorModeProviderProps) {
  return (
    <ChakraProvider value={system}>
      <ColorModeProvider {...props}>
        {children}
        <Toaster />
      </ColorModeProvider>
    </ChakraProvider>
  );
}
