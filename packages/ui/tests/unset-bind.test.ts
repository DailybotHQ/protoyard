import { cleanup, render } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';
import {
  Combobox,
  Composer,
  EmojiPicker,
  OtpInput,
  Select,
  TextCounter,
  UserPicker,
} from '../src/index.ts';
import UnsetBindHarness from './fixtures/UnsetBindHarness.svelte';

afterEach(() => cleanup());

const option = { value: 'a', label: 'Alpha' };

/**
 * A caller may bind `value` to an entry that does not exist yet
 * (`bind:value={draft[id]}`). With a `$bindable('')` fallback Svelte throws
 * props_invalid_value and the whole screen fails to mount (logistics-map's
 * Dispatch screen did). These controls read an unset value as ''.
 */
const CASES = {
  Select: [Select, { items: [option], label: 'Kind' }],
  Combobox: [Combobox, { items: [option], label: 'Kind' }],
  OtpInput: [OtpInput, { label: 'Code' }],
  Composer: [Composer, { onSubmit: () => {} }],
  TextCounter: [TextCounter, { label: 'Bio', maxlength: 10 }],
  EmojiPicker: [EmojiPicker, { label: 'Emoji' }],
  UserPicker: [UserPicker, { users: [{ id: 'u1', name: 'Ada Example' }], label: 'Assignee' }],
} as const;

describe('controls bound to an unset value', () => {
  for (const [name, [component, props]] of Object.entries(CASES)) {
    it(`${name} mounts with bind:value to an undefined entry`, () => {
      expect(() => {
        render(UnsetBindHarness, { props: { component: component as never, props } });
        flushSync();
      }).not.toThrow();
      expect(document.body.textContent?.length ?? 0).toBeGreaterThan(0);
    });
  }
});
