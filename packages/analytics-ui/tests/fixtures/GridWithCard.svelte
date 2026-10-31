<script lang="ts">
import DashboardGrid from '../../src/grid/DashboardGrid.svelte';
import WidgetCard from '../../src/grid/WidgetCard.svelte';
</script>

<DashboardGrid layout={[{ id: 'revenue', widget: 'kpi', title: 'Revenue', x: 0, y: 0, w: 6, h: 3 }]} label="Growth">
  {#snippet widget(item)}
    <WidgetCard title={item.title ?? item.widget} description="Last 30 days">
      {#snippet children()}<p>Body</p>{/snippet}
    </WidgetCard>
  {/snippet}
</DashboardGrid>
