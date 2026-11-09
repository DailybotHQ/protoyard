<script lang="ts">
import { Compass } from '@lucide/svelte';
import { avatarImage, usePrincipal } from '@protoyard/renderer-svelte';
import { Avatar, Badge } from '@protoyard/ui';
import { LucideIcon } from 'texuli/icons/lucide';
import { Box, Text } from 'texuli/typography';
import { ROLE_LABELS } from '../domain/policy.ts';
import { useOnboarding } from '../lib/context.ts';

const principal = usePrincipal();
const { workspace } = useOnboarding();
</script>

<Box as="header" surface="default" radius="none" border="block-end" padding="none" class="sticky top-0 z-20 pt-safe">
  <div class="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4 sm:px-6">
    <a href="#/" class="flex min-w-0 items-center gap-2">
      <Box as="div" surface="muted" radius="lg" padding="sm" class="inline-flex shrink-0 items-center justify-center">
        <LucideIcon icon={Compass} size="sm" tone="primary" />
      </Box>
      <Text as="span" weight="semibold" truncate>
        {workspace.current?.name ?? principal.current?.organization?.name ?? 'Workspace'}
      </Text>
    </a>
    {#if principal.current}
      <div class="ml-auto flex min-w-0 items-center gap-2.5">
        <div class="hidden min-w-0 text-right sm:block">
          <Text size="sm" weight="medium" align="end" truncate>{principal.current.persona.name}</Text>
          <Text size="xs" tone="muted" align="end" truncate>{principal.current.persona.email}</Text>
        </div>
        <Badge variant={principal.current.role === 'viewer' ? 'outline' : 'secondary'}>
          {ROLE_LABELS[principal.current.role ?? ''] ?? principal.current.role}
        </Badge>
        <Avatar name={principal.current.persona.name} {...avatarImage(principal.current.persona.avatar)} size="sm" />
      </div>
    {/if}
  </div>
</Box>
