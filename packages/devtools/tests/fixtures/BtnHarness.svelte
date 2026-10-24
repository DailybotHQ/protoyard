<script lang="ts">
import Btn from '../../src/primitives/Btn.svelte';

let {
  label = 'Action',
  variant = 'outline',
}: {
  label?: string;
  variant?: 'primary' | 'outline' | 'ghost' | 'danger';
} = $props();
</script>

<Btn {variant}>{label}</Btn>
