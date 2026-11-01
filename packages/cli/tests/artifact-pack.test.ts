// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkTextAsset, packArtifact, transformPage } from '../src/lib/artifact-pack.ts';
import { buildQuickArtifact } from '../src/lib/quick/artifact.ts';

/**
 * Artifact pack refusals (PLAN_009 essential set): an Artifact page fetches
 * only its own files, so external or root-absolute CSS, network imports,
 * service workers, paths outside the pack and U+FFFD are refused.
 */

function page(head: string): string {
  return `<!doctype html><html><head><title>Demo</title>${head}<script type="module" src="./assets/index.js"></script></head><body><div id="app"></div></body></html>`;
}
const reasons = (html: string) => transformPage(html).issues.map((issue) => issue.reason);

describe('artifact pack refusals', () => {
  it('refuses external and root-absolute CSS references but keeps relative and Google Fonts ones', () => {
    const css = [
      '@import url("https://fonts.googleapis.com/css2?family=Inter");',
      '@import "https://cdn.example/reset.css";',
      '.a{background:url(./img/a.png)}',
      '.b{background:url("https://cdn.example/b.png")}',
      '.c{background:url(/c.png)}',
    ].join('\n');
    expect(checkTextAsset('assets/a.css', css).map((issue) => issue.reason)).toEqual([
      '@import "https://cdn.example/reset.css" is external; only Google Fonts stylesheets are allowed',
      'url(https://cdn.example/b.png) is external; the Artifact fetches only its own files',
      'url(/c.png) is root-absolute; build with the relative base ./',
    ]);
  });

  it('refuses network imports and service workers in scripts, not URL strings in data', () => {
    expect(
      checkTextAsset('assets/a.js', 'import("https://esm.example/x.js");').map((i) => i.reason)
    ).toEqual(['imports "https://esm.example/x.js" over the network; bundle it instead']);
    expect(checkTextAsset('assets/a.js', 'import x from "//esm.example/x.js";')).toHaveLength(1);
    expect(checkTextAsset('assets/a.js', 'navigator.serviceWorker.register("./sw.js")')).toEqual([
      { path: 'assets/a.js', reason: 'registers a service worker; build without offline support' },
    ]);
    expect(reasons(page('<script>navigator.serviceWorker.register("./sw.js")</script>'))).toContain(
      'an inline script registers a service worker; build without offline support'
    );
    expect(checkTextAsset('assets/a.js', 'const site = "https://acme.example";')).toEqual([]);
  });

  it('refuses page paths that would resolve outside the Artifact', () => {
    const found = [
      ...reasons(page('<base href="/x/">')),
      ...reasons(page('<link rel="stylesheet" href="/assets/a.css">')),
      ...reasons(page('<link rel="modulepreload" href="../outside.js">')),
      ...reasons(page('<script src="javascript:alert(1)"></script>')),
    ];
    expect(found).toEqual(
      expect.arrayContaining([
        'index.html has a <base> element; relative asset paths would resolve elsewhere',
        'stylesheet href "/assets/a.css" is root-absolute; build with the relative base ./',
        'preload href "../outside.js" leaves the build folder',
        'script src "javascript:alert(1)" is not a file path the Artifact can serve',
      ])
    );
  });

  describe('packArtifact', () => {
    let root = '';
    afterEach(() => rmSync(root, { recursive: true, force: true }));

    it('refuses U+FFFD in a text file without an escape, and a service worker file, writing nothing', async () => {
      root = mkdtempSync(join(tmpdir(), 'protoyard-artifact-pack-'));
      const dist = join(root, 'dist');
      const out = join(root, 'artifact');
      const write = (path: string, content: string) => {
        mkdirSync(dirname(join(dist, path)), { recursive: true });
        writeFileSync(join(dist, path), content);
      };
      write('index.html', page(''));
      write('assets/index.js', 'export const x = 1;');
      write('favicon.svg', '<svg xmlns="http://www.w3.org/2000/svg"><title>�</title></svg>');
      write('sw.js', 'self.addEventListener("fetch", () => {});');
      const result = await packArtifact({
        distDir: dist,
        outDir: out,
        slug: 'demo',
        manifest: { id: 'example.demo', name: 'Demo', description: 'A demo.', category: 'sales' },
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.issues).toEqual(
        expect.arrayContaining([
          {
            path: 'favicon.svg',
            reason: 'contains the replacement character U+FFFD, which the Artifact refuses',
          },
          { path: 'sw.js', reason: 'a service worker file; build without offline support' },
        ])
      );
      expect(existsSync(out)).toBe(false);
    });
  });

  it('quick artifact refuses U+FFFD, network markup and imports, service workers and a non-document', () => {
    const single = [
      '<!doctype html><html lang="en"><head><meta charset="UTF-8"><title>Old</title>',
      '<script>/* bootstrap */</script></head><body><div id="app"></div>',
      '<script type="text/plain" data-py-chunk="index.js">const s=1;</script></body></html>',
    ].join('\n');
    const cases: [string, string][] = [
      [single.replace('<div id="app"></div>', '<div>�</div>'), 'U+FFFD'],
      [
        single.replace('</body>', '<script src="https://cdn.example.com/x.js"></script></body>'),
        'network resource',
      ],
      [
        single.replace('const s=', 'import("https://cdn.example.com/x.js");const s='),
        'over the network',
      ],
      [
        single.replace('/* bootstrap */', 'navigator.serviceWorker.register("sw.js")'),
        'service worker',
      ],
      ['<p>not a document</p>', 'no <head> and <body>'],
    ];
    for (const [html, reason] of cases) {
      const pack = buildQuickArtifact({
        singleFileHtml: html,
        slug: 'demo',
        blueprint: { name: 'Demo Desk', category: 'logistics' },
        blueprintSha256: 'a'.repeat(64),
        playerVersion: '1.0.0',
      });
      expect(pack.issues.map((i) => i.reason).join(' | '), reason).toContain(reason);
    }
  });
});
