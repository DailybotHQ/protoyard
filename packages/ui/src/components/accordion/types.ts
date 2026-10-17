export interface AccordionItem {
  value: string;
  title: string;
  /** Plain-text body; use the `content` snippet for rich content. */
  content?: string;
  disabled?: boolean;
}
