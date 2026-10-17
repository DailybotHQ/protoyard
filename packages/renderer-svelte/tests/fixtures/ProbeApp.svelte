<script lang="ts">
import { can, useAppearance, usePrincipal } from '../../src/index.ts';

const principal = usePrincipal();
const appearance = useAppearance();
</script>

<p data-testid="who">{principal.current?.persona.name ?? 'nobody'}</p>
<p data-testid="role">{principal.current?.role ?? 'none'}</p>
<p data-testid="can-create">{can('records:create') ? 'yes' : 'no'}</p>
<p data-testid="mode">{appearance.current.resolvedMode}</p>
