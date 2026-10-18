export interface CommandPaletteItem {
  id: string;
  label: string;
  group: string;
  description?: string;
  keywords?: string[];
}

export type CommandPaletteSearch = (query: string) => Promise<CommandPaletteItem[]>;

export type CommandPaletteSelect = (item: CommandPaletteItem) => void;
