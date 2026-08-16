import type { ButtonProps } from "@chakra-ui/react";
import { Icon, IconButton as ChakraIconButton } from "@chakra-ui/react";
import * as React from "react";
import { X } from "lucide-react";

export type CloseButtonProps = ButtonProps;

export const CloseButton = React.forwardRef<HTMLButtonElement, CloseButtonProps>(
  function CloseButton(props, ref) {
    return (
      <ChakraIconButton variant="ghost" aria-label="Close" ref={ref} {...props}>
        {props.children ?? (
          <Icon asChild>
            <X />
          </Icon>
        )}
      </ChakraIconButton>
    );
  },
);
