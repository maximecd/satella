import { useTranslation } from "react-i18next";

import {
  AccordionItem,
  AccordionItemContent,
  AccordionItemTrigger,
  AccordionRoot,
} from "../components/ui/accordion";
import { Markdown } from "../markdown";

export function SetupInstructions({ source }: { readonly source: string | undefined }) {
  const { t } = useTranslation();
  const markdown = source?.replace(/^#\s+.*$/m, "").trim();
  if (markdown === undefined || markdown.length === 0) return null;
  return (
    <AccordionRoot collapsible variant="enclosed">
      <AccordionItem value="setup">
        <AccordionItemTrigger>{t("security.setupInstructions")}</AccordionItemTrigger>
        <AccordionItemContent>
          <Markdown headingLevelStart={3}>{markdown}</Markdown>
        </AccordionItemContent>
      </AccordionItem>
    </AccordionRoot>
  );
}
