<script lang="ts">
// Through the @protoyard/ui barrel, which re-exports texuli's Button.
import { Button, type ButtonProps } from '../../src/index.ts';

let { label = 'Save', ...props }: ButtonProps & { label?: string } = $props();
</script>

<Button {...props}>{label}</Button>
