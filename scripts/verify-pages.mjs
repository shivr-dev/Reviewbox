import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function applicationAssets(html) {
  assert.match(
    html,
    /<div\b[^>]*\bid=["']root["']/i,
    'Published entry is not the Review application. Check Pages Source: GitHub Actions.',
  );
  const scripts = [
    ...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi),
  ].map((match) => match[1]);
  assert.ok(
    scripts.some((src) => /(?:^|\/)assets\/.+\.js(?:\?|$)/.test(src)),
    'Application entry does not reference its built JavaScript.',
  );
  return scripts;
}

export async function verifyLocal(directory) {
  const html = await readFile(resolve(directory, 'index.html'), 'utf8');
  for (const asset of applicationAssets(html)) {
    assert.ok(
      !asset.startsWith('/') && !asset.includes('..'),
      'Pages assets must work under the repository path.',
    );
    await readFile(resolve(directory, asset));
  }
  await readFile(resolve(directory, '.nojekyll'));
  JSON.parse(await readFile(resolve(directory, 'version.json'), 'utf8'));
}

export async function verifyPublished(baseUrl, commit) {
  const base = new URL(baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  const request = async (path) => {
    const url = new URL(path, base);
    url.searchParams.set('release-check', `${commit}-${Date.now()}`);
    const response = await fetch(url, {
      signal: AbortSignal.timeout(20000),
      cache: 'no-store',
    });
    assert.ok(response.ok, `${url.pathname} returned HTTP ${response.status}`);
    return response;
  };
  const html = await (await request('')).text();
  const assets = applicationAssets(html);
  const version = await (await request('version.json')).json();
  assert.equal(
    version.commit,
    commit,
    'The published website is not the expected commit.',
  );
  for (const asset of assets) {
    const response = await request(asset);
    assert.match(
      response.headers.get('content-type') || '',
      /javascript/i,
      'An application script returned an HTML fallback.',
    );
    await response.body?.cancel();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  if (process.argv[2] === '--url') {
    let lastError;
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        await verifyPublished(process.argv[3], process.argv[4]);
        console.log(
          'Published Review entry, version and application assets verified.',
        );
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        if (attempt < 5) await new Promise((done) => setTimeout(done, 5000));
      }
    }
    if (lastError) throw lastError;
  } else {
    await verifyLocal(process.argv[2] || 'pages-dist');
    console.log('Review Pages build artifact verified.');
  }
}
