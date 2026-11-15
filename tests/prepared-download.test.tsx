import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import {
  PreparedDownload,
  usePreparedDownload,
} from '../components/prepared-download';
const { JSDOM } = createRequire(import.meta.url)('jsdom');
test('generated Word download remains available until replacement, account change or unmount', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' }),
    keys = ['window', 'document', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT'],
    previous = keys.map((k) => (globalThis as any)[k]);
  keys.forEach(
    (k, i) =>
      ((globalThis as any)[k] =
        i === 0
          ? dom.window
          : i === 1
            ? dom.window.document
            : i === 2
              ? dom.window.HTMLElement
              : true),
  );
  const create = URL.createObjectURL,
    revoke = URL.revokeObjectURL,
    revoked: string[] = [],
    originalClick = dom.window.HTMLAnchorElement.prototype.click;
  let index = 0,
    automatic = 0;
  URL.createObjectURL = () => 'blob:prepared-' + ++index;
  URL.revokeObjectURL = (url) => {
    revoked.push(url);
  };
  dom.window.HTMLAnchorElement.prototype.click = function () {
    automatic++;
  };
  const root = createRoot(document.getElementById('root')!);
  function Harness({ ns }: { ns: string }) {
    const download = usePreparedDownload(ns);
    return (
      <>
        <button
          onClick={() => download.prepare(new Blob(['document']), '练习.docx')}
        >
          生成
        </button>
        <PreparedDownload file={download.file} />
      </>
    );
  }
  try {
    await act(async () => root.render(<Harness ns="user-a" />));
    await act(async () =>
      document
        .querySelector('button')!
        .dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })),
    );
    const link = document.querySelector('a')!;
    assert.equal(link.getAttribute('download'), '练习.docx');
    assert.equal(link.getAttribute('href'), 'blob:prepared-1');
    assert.equal(automatic, 0);
    assert.equal(revoked.length, 0);
    assert.match(document.body.textContent!, /下载 Word 文档/);
    await act(async () =>
      document
        .querySelector('button')!
        .dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })),
    );
    assert.equal(
      document.querySelector('a')!.getAttribute('href'),
      'blob:prepared-2',
    );
    assert.equal(revoked.length, 0);
    await act(async () => root.render(<Harness ns="user-b" />));
    assert.equal(document.querySelector('a'), null);
    assert.ok(revoked.includes('blob:prepared-1'));
  } finally {
    await act(async () => root.unmount());
    URL.createObjectURL = create;
    URL.revokeObjectURL = revoke;
    dom.window.HTMLAnchorElement.prototype.click = originalClick;
    keys.forEach((k, i) => {
      (globalThis as any)[k] = previous[i];
    });
  }
});
