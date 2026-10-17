<script lang="ts">
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  toast,
} from '@protoyard/ui';

let plan = $state<'free' | 'pro'>('free');
let dismissed = $state(false);
</script>

<div class="grid gap-4 md:grid-cols-2">
  <Card>
    <CardHeader>
      <div class="flex items-center justify-between gap-2">
        <CardTitle>Current plan</CardTitle>
        <Badge variant={plan === 'pro' ? 'success' : 'secondary'}>{plan === 'pro' ? 'Pro' : 'Free'}</Badge>
      </div>
      <CardDescription>
        {plan === 'pro' ? 'Unlimited projects, priority support.' : 'Up to 3 projects and 2 members.'}
      </CardDescription>
    </CardHeader>
    <CardContent>
      <p class="font-heading text-2xl font-semibold">{plan === 'pro' ? '$12' : '$0'}<span class="text-sm font-normal text-muted-foreground"> / seat / month</span></p>
    </CardContent>
    <CardFooter class="justify-end">
      {#if plan === 'free'}
        <Button
          onclick={() => {
            plan = 'pro';
            toast.success('Upgraded to Pro');
          }}
        >
          Upgrade
        </Button>
      {:else}
        <Button variant="outline" onclick={() => (plan = 'free')}>Downgrade</Button>
      {/if}
    </CardFooter>
  </Card>

  {#if !dismissed}
    <Card>
      <CardHeader>
        <CardTitle>Invite your team</CardTitle>
        <CardDescription>Workspaces with 3+ members finish projects 2× faster.</CardDescription>
      </CardHeader>
      <CardFooter class="mt-auto">
        <Button size="sm" onclick={() => toast.success('Invite link copied (demo)')}>Copy invite link</Button>
        <Button size="sm" variant="ghost" onclick={() => (dismissed = true)}>Dismiss</Button>
      </CardFooter>
    </Card>
  {:else}
    <Card class="items-center justify-center p-6 text-sm text-muted-foreground">
      <p>Card dismissed.</p>
      <Button size="sm" variant="link" onclick={() => (dismissed = false)}>Show it again</Button>
    </Card>
  {/if}
</div>
