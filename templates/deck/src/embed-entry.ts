import {
  EMBEDDED_APP_PROTOCOL,
  embeddedAppNamespace,
  isEmbeddedAppMessage,
  loadEmbeddedApp,
} from '@protoyard/blueprint/kinds/embed';

const target = document.getElementById('app');
if (!target) throw new Error('index.html must contain <div id="app"></div>');
const mountTarget = target;

let started = false;
let mounted: { destroy(): Promise<void> } | null = null;
const parentOrigin = location.origin;

function send(message: unknown): void {
  window.parent.postMessage(message, parentOrigin);
}

async function start(event: MessageEvent<unknown>): Promise<void> {
  if (event.source !== window.parent || event.origin !== parentOrigin || started) return;
  if (!isEmbeddedAppMessage(event.data) || event.data.type !== 'start') return;
  started = true;
  const request = event.data;
  try {
    const loaded = loadEmbeddedApp(request.app);
    if (!loaded.success) {
      const issue = loaded.issues[0];
      throw new Error(issue ? `${issue.message} ${issue.fix}` : 'The embedded app is not valid.');
    }
    const namespace = await embeddedAppNamespace(request.hostNamespace, request.blockId);
    const { bootPlayer } = await import('@protoyard/player/boot');
    mounted = await bootPlayer({
      blueprint: loaded.blueprint,
      target: mountTarget,
      namespace,
      search: '?devtools=0',
    });
    send({
      protocol: EMBEDDED_APP_PROTOCOL,
      type: 'loaded',
      requestId: request.requestId,
      namespace,
      name: loaded.blueprint.name,
    });
  } catch (error) {
    send({
      protocol: EMBEDDED_APP_PROTOCOL,
      type: 'error',
      requestId: request.requestId,
      message:
        error instanceof Error ? error.message.slice(0, 500) : 'The embedded app failed to start.',
    });
  }
}

window.addEventListener('message', (event) => void start(event));
window.addEventListener('pagehide', () => {
  if (mounted) void mounted.destroy();
});
send({ protocol: EMBEDDED_APP_PROTOCOL, type: 'ready' });
