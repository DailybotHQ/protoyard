let sequence = 0;

/** Starts a validated app in an isolated same-origin frame only after Start is pressed. */
export async function mountEmbeddedApp(
  target: HTMLElement,
  input: Record<string, unknown>,
  hostNamespace: string
): Promise<() => void> {
  const { embeddedAppNamespace, EMBEDDED_APP_PROTOCOL, isEmbeddedAppMessage, loadEmbeddedApp } =
    await import('@protoyard/blueprint/kinds/embed');
  const loaded = loadEmbeddedApp(input);
  if (!loaded.success) {
    const issue = loaded.issues[0];
    throw new Error(issue ? `${issue.message} ${issue.fix}` : 'The embedded app is not valid.');
  }
  const blockId = target.closest<HTMLElement>('[data-py-embed-app]')?.dataset.pyEmbedApp;
  if (!blockId) throw new Error('The embedded app has no stable block id.');
  const namespace = await embeddedAppNamespace(hostNamespace, blockId);
  const url = new URL(location.href);
  if (!/^https?:$/.test(url.protocol) || url.origin !== location.origin) {
    throw new Error('Embedded apps need the generated prototype served over same-origin http(s).');
  }
  url.search = '';
  url.searchParams.set('__py_embed', '1');
  url.hash = '';

  const frame = document.createElement('iframe');
  frame.src = url.href;
  frame.title = loaded.blueprint.name;
  frame.className = 'block h-full min-h-48 w-full border-0';
  frame.referrerPolicy = 'no-referrer';
  const requestId = `embed-${++sequence}`;
  let sent = false;
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const dispose = () => {
    if (closed) return;
    closed = true;
    if (timer !== undefined) clearTimeout(timer);
    window.removeEventListener('message', onMessage);
    frame.remove();
  };
  const onMessage = (event: MessageEvent<unknown>) => {
    if (closed || event.origin !== url.origin || event.source !== frame.contentWindow) return;
    if (!isEmbeddedAppMessage(event.data)) return;
    const message = event.data;
    if (message.type === 'ready' && !sent) {
      sent = true;
      frame.contentWindow?.postMessage(
        {
          protocol: EMBEDDED_APP_PROTOCOL,
          type: 'start',
          requestId,
          hostNamespace,
          blockId,
          app: loaded.blueprint,
        },
        url.origin
      );
    } else if (message.type === 'loaded' && message.requestId === requestId) {
      if (message.namespace !== namespace) {
        fail(new Error('The embedded app opened an unexpected storage namespace.'));
      } else {
        finish();
      }
    } else if (message.type === 'error' && message.requestId === requestId) {
      fail(new Error(message.message));
    }
  };

  let resolveStart!: () => void;
  let rejectStart!: (error: Error) => void;
  const started = new Promise<void>((resolve, reject) => {
    resolveStart = resolve;
    rejectStart = reject;
  });
  const finish = () => {
    if (timer !== undefined) clearTimeout(timer);
    resolveStart();
  };
  const fail = (error: Error) => {
    dispose();
    rejectStart(error);
  };

  window.addEventListener('message', onMessage);
  frame.addEventListener('error', () => fail(new Error('The embedded app frame could not load.')));
  timer = setTimeout(() => fail(new Error('The embedded app did not start in time.')), 30_000);
  target.replaceChildren(frame);
  try {
    await started;
  } catch (error) {
    dispose();
    throw error;
  }
  return dispose;
}
