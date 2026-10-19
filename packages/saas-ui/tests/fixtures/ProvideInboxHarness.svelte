<script lang="ts">
import type { PrototypeRuntime } from '@protoyard/core';
import type { InboxService } from '@protoyard/saas';
import { provideSaas } from '../../src/context.ts';
import InboxDrawer from '../../src/screens/inbox/InboxDrawer.svelte';

interface Props {
  service: InboxService;
  embedded?: boolean;
  recipient?: string;
  lockRecipient?: boolean;
}

const runtime = { session: { principal: () => null } } as unknown as PrototypeRuntime;
let { service, embedded = false, recipient, lockRecipient = false }: Props = $props();
provideSaas(runtime);
</script>

<InboxDrawer {service} {embedded} {recipient} {lockRecipient} />
