<script lang="ts" module>
let nextInstanceId = 0;
</script>

<script lang="ts">
let count = $state(0);
const instanceId = ++nextInstanceId;
</script>

<button type="button" onclick={() => count++}>Screen {instanceId}; count: {count}</button>
