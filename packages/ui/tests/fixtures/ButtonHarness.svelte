<script lang="ts">
import Button from '../../src/components/button/Button.svelte';
import type { ButtonProps } from '../../src/components/button/button-variants.ts';

let { label = 'Save', ...props }: ButtonProps & { label?: string } = $props();
</script>

<Button {...props}>{label}</Button>
