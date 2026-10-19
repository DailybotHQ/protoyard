import { createEntityServices, deriveStores, nextAvatar } from '@protoyard/blueprint';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createBlueprintDefinition,
  helpdeskBlueprint,
} from '../../../tests/fixtures/blueprint-prototype.ts';
import { createHarness } from '../../../tests/support/runtime.ts';
import AvatarPicker from '../src/fields/AvatarPicker.svelte';
import { formatFieldValue } from '../src/format.ts';
import { BoardScreen } from '../src/screens/board/index.ts';
import CrudHarness from './fixtures/CrudHarness.svelte';

// The help desk fixture with a face on customers (avatars add no index, so stores match).
const blueprint = structuredClone(helpdeskBlueprint);
blueprint.entities[0]!.fields.push({
  name: 'avatar',
  kind: 'avatar',
  label: 'Photo',
  required: false,
  sensitive: false,
});
const avatarField = blueprint.entities[0]!.fields.at(-1)!;
blueprint.entities[1]!.fields.push({ ...avatarField, name: 'face' });

function definition() {
  const base = createBlueprintDefinition('crud-avatar-fixture');
  return {
    ...base,
    database: { ...base.database, versions: [{ version: 1, stores: deriveStores(blueprint) }] },
  };
}

let harness = createHarness(definition());
beforeEach(() => {
  harness = createHarness(definition());
});
afterEach(() => {
  cleanup();
  harness.closeAll();
});

async function boot(scenario = 'owner') {
  const runtime = await harness.boot(scenario);
  return { runtime, services: createEntityServices(runtime, blueprint) };
}

const current = () => document.querySelector('[data-avatar-current]')?.textContent?.trim();
const option = (index: number) =>
  document.querySelector<HTMLElement>(`[role="option"][data-face-index="${index}"]`)!;

describe('avatar formatting', () => {
  it('formats the stored library id', () => {
    expect(formatFieldValue(avatarField, 'av-042')).toBe('av-042');
    expect(formatFieldValue(avatarField, null)).toBe('—');
  });
});

describe('EntityList and EntityDetail faces', () => {
  it('shows the face next to the record title in the list', async () => {
    const { runtime, services } = await boot();
    await services.customer!.create({ name: 'Ada Example', avatar: 'av-007' });
    render(CrudHarness, { runtime, blueprint, services, mode: 'list', entityName: 'customer' });

    await waitFor(() => expect(screen.getByText('Ada Example')).toBeTruthy());
    const face = document.querySelector<HTMLImageElement>('img[data-record-avatar="av-007"]');
    expect(face?.getAttribute('src')).toBe('./avatars/64/av-007.webp');
    expect(face?.getAttribute('loading')).toBe('lazy');
    expect(face?.getAttribute('alt')).toBe('');
    expect(face?.closest('td')?.textContent).toContain('Ada Example');
    // The id is never a column of its own.
    expect(screen.queryByRole('columnheader', { name: /Photo/i })).toBeNull();
  });

  it('shows the face in the detail header and the photo field', async () => {
    const { runtime, services } = await boot();
    const row = await services.customer!.create({ name: 'Grace Example', avatar: 'av-012' });
    render(CrudHarness, {
      runtime,
      blueprint,
      services,
      mode: 'detail',
      entityName: 'customer',
      initial: row,
    });

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Grace Example' })).toBeTruthy()
    );
    const faces = document.querySelectorAll('img[data-record-avatar="av-012"]');
    expect(faces).toHaveLength(2);
    expect((faces[0] as HTMLImageElement).getAttribute('src')).toBe('./avatars/128/av-012.webp');
    expect(screen.getByText('av-012')).toBeTruthy();
  });
});

describe('BoardScreen faces', () => {
  it('shows the face next to the card title and never as its own line', async () => {
    const { runtime, services } = await boot();
    const [customer] = await services.customer!.list();
    await services.ticket!.create({
      subject: 'Face on a card',
      customerId: customer!.id,
      face: 'av-033',
    });
    render(BoardScreen, {
      runtime,
      blueprint,
      services,
      screen: {
        type: 'board',
        entity: 'ticket',
        groupBy: 'status',
        cardFields: ['subject', 'face'],
      },
      onOpenRecord: () => {},
    });
    const face = await waitFor(() => {
      const img = document.querySelector<HTMLImageElement>('img[data-record-avatar="av-033"]');
      expect(img).toBeTruthy();
      return img!;
    });
    expect(face.getAttribute('loading')).toBe('lazy');
    expect(face.closest('p')?.textContent).toContain('Face on a card');
    expect(face.closest('[data-board-card]')?.textContent).not.toContain('av-033');
  });
});

describe('AvatarPicker', () => {
  it('opens a searchable grid navigable with the keyboard', async () => {
    render(AvatarPicker, { label: 'Photo', value: null });
    expect(current()).toBe('No face yet');
    const toggle = screen.getByRole('button', { name: 'Choose face: Photo' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    await fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.getAttribute('aria-label')).toBe('Hide faces: Photo');

    const listbox = screen.getByRole('listbox', { name: 'Photo faces' });
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(175);
    expect(options.filter((o) => o.tabIndex === 0)).toEqual([option(0)]);
    expect(listbox.querySelector('img')?.getAttribute('loading')).toBe('lazy');

    option(0).focus();
    await fireEvent.keyDown(option(0), { key: 'ArrowRight' });
    await waitFor(() => expect(document.activeElement).toBe(option(1)));
    await fireEvent.keyDown(option(1), { key: 'ArrowDown' });
    await waitFor(() => expect(document.activeElement).toBe(option(9)));
    await fireEvent.keyDown(option(9), { key: 'ArrowUp' });
    await waitFor(() => expect(document.activeElement).toBe(option(1)));
    await fireEvent.keyDown(option(1), { key: 'ArrowLeft' });
    await waitFor(() => expect(document.activeElement).toBe(option(0)));
    await fireEvent.keyDown(option(0), { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(option(0));
    await fireEvent.keyDown(option(0), { key: 'End' });
    await waitFor(() => expect(document.activeElement).toBe(option(174)));
    await fireEvent.keyDown(option(174), { key: 'Enter' });
    await waitFor(() => expect(current()).toBe('Face av-175'));
    expect(option(174).getAttribute('aria-selected')).toBe('true');
    await fireEvent.keyDown(option(174), { key: 'Home' });
    await waitFor(() => expect(document.activeElement).toBe(option(0)));
    await fireEvent.keyDown(option(0), { key: ' ' });
    await waitFor(() => expect(current()).toBe('Face av-001'));

    const search = screen.getByRole('searchbox', { name: /Search photo faces by id/i });
    await fireEvent.input(search, { target: { value: '042' } });
    expect(screen.getAllByRole('option').map((o) => o.dataset.avatarId)).toEqual(['av-042']);
    await fireEvent.input(search, { target: { value: 'av-17' } });
    expect(screen.getAllByRole('option')).toHaveLength(6);
    await fireEvent.click(screen.getAllByRole('option')[2]!);
    await waitFor(() => expect(current()).toBe('Face av-172'));
    await fireEvent.input(search, { target: { value: 'zzz' } });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('No face matches');
  });

  it('shuffles a draft deterministically and removes an optional face', async () => {
    render(AvatarPicker, { label: 'Photo', value: 'av-010', shuffleKey: 'customer:new:avatar' });
    await fireEvent.click(screen.getByRole('button', { name: 'Shuffle face' }));
    const first = nextAvatar('av-010', 'customer:new:avatar');
    await waitFor(() => expect(current()).toBe(`Face ${first}`));
    await fireEvent.click(screen.getByRole('button', { name: 'Shuffle face' }));
    await waitFor(() => expect(current()).toBe(`Face ${nextAvatar(first, 'customer:new:avatar')}`));
    await fireEvent.click(screen.getByRole('button', { name: 'Remove face' }));
    await waitFor(() => expect(current()).toBe('No face yet'));
  });

  it('shows pending feedback while a service shuffle runs and keeps the saved face', async () => {
    let resolve: (face: string | undefined) => void = () => {};
    let calls = 0;
    const onShuffle = () => {
      calls++;
      return new Promise<string | undefined>((done) => {
        resolve = done;
      });
    };
    render(AvatarPicker, { label: 'Photo', value: 'av-010', onShuffle });
    expect(screen.getByText(/saves the new face right away/i)).toBeTruthy();
    const shuffle = screen.getByRole('button', { name: 'Shuffle face' });
    await fireEvent.click(shuffle);
    await waitFor(() => expect(shuffle.getAttribute('aria-busy')).toBe('true'));
    await fireEvent.click(shuffle);
    expect(calls).toBe(1);
    expect(current()).toBe('Face av-010');
    resolve('av-099');
    await waitFor(() => expect(current()).toBe('Face av-099'));
    expect(shuffle.getAttribute('aria-busy')).toBeNull();

    // A failed shuffle (undefined) keeps the current face.
    await fireEvent.click(shuffle);
    resolve(undefined);
    await waitFor(() => expect(shuffle.getAttribute('aria-busy')).toBeNull());
    expect(current()).toBe('Face av-099');
  });
});

describe('EntityForm avatar field', () => {
  it('picks a face for a new record and saves it on create', async () => {
    const { runtime, services } = await boot();
    render(CrudHarness, {
      runtime,
      blueprint,
      services,
      mode: 'form-create',
      entityName: 'customer',
    });
    // The picker loads lazily.
    await fireEvent.click(await screen.findByRole('button', { name: 'Choose face: Photo' }));
    expect(screen.queryByText(/saves the new face right away/i)).toBeNull();
    await fireEvent.click(option(4));
    await waitFor(() => expect(current()).toBe('Face av-005'));
    await fireEvent.input(screen.getByRole('textbox', { name: /^name/i }), {
      target: { value: 'Faces Example' },
    });
    await fireEvent.click(screen.getByRole('button', { name: /Create customer/i }));
    await waitFor(() => expect(screen.getByTestId('created-id').textContent).toMatch(/^customer_/));
    const stored = await services.customer!.get(screen.getByTestId('created-id').textContent!);
    expect(stored?.avatar).toBe('av-005');
  });

  it('shuffles a saved record through the entity service', async () => {
    const { runtime, services } = await boot();
    const row = await services.customer!.create({ name: 'Shuffle Example', avatar: 'av-020' });
    render(CrudHarness, {
      runtime,
      blueprint,
      services,
      mode: 'form-edit',
      entityName: 'customer',
      initial: row,
    });
    await fireEvent.click(await screen.findByRole('button', { name: 'Shuffle face' }));
    const expected = nextAvatar('av-020', `customer:${row.id}:avatar`);
    await waitFor(() => expect(current()).toBe(`Face ${expected}`));
    expect((await services.customer!.get(row.id))?.avatar).toBe(expected);
    expect(screen.queryByTestId('edited-id')).toBeNull();
  });

  it('keeps the face and writes nothing when the shuffle is denied', async () => {
    const { runtime, services } = await boot('viewer');
    const [row] = await services.customer!.list();
    render(CrudHarness, {
      runtime,
      blueprint,
      services,
      mode: 'form-edit',
      entityName: 'customer',
      initial: row,
    });
    await fireEvent.click(await screen.findByRole('button', { name: 'Shuffle face' }));
    await waitFor(() => expect(screen.getByText('Not allowed')).toBeTruthy());
    expect(current()).toBe('No face yet');
    expect((await services.customer!.get(row!.id))?.avatar).toBeUndefined();
  });
});
