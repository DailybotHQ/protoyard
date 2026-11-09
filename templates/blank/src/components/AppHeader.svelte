<script lang="ts">
import { NotebookPen } from '@lucide/svelte';
import { avatarImage, can, usePrincipal } from '@protoyard/renderer-svelte';
import { Avatar, Badge } from '@protoyard/ui';
import { LucideIcon } from 'texuli/icons/lucide';
import { Box, Text } from 'texuli/typography';
import { CAPABILITIES } from '../domain/policy.ts';

const principal = usePrincipal();
const readOnly = $derived(principal.current ? !can(CAPABILITIES.create) : false);
</script>

<Box as="header" padding="none" radius="none" border="block-end" surface="default" class="sticky top-0 z-20 pt-safe">
  <div class="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4 sm:px-6">
    <a href="#/" class="flex items-center gap-2">
      <LucideIcon icon={NotebookPen} tone="primary" size="md" />
      <Text as="span" weight="semibold">{principal.current?.organization?.name ?? 'Notes'}</Text>
    </a>
    <div class="ml-auto flex min-w-0 items-center gap-2.5">
      {#if principal.current}
        {#if readOnly}<Badge variant="secondary">Read-only</Badge>{/if}
        <div class="hidden min-w-0 sm:block">
          <Text size="sm" weight="medium" align="end" truncate>{principal.current.persona.name}</Text>
          <Text size="xs" tone="muted" align="end" truncate>{principal.current.role}</Text>
        </div>
        <Avatar name={principal.current.persona.name} {...avatarImage(principal.current.persona.avatar)} size="sm" />
      {/if}
    </div>
  </div>
</Box>
