import { fireEvent, screen } from '@testing-library/svelte';

/** Choose a value through Texuli's accessible select trigger and option. */
export async function selectOption(label: string, option: string): Promise<void> {
  await fireEvent.click(screen.getByRole('combobox', { name: label }));
  await fireEvent.click(await screen.findByRole('option', { name: option }));
}
