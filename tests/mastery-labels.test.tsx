import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { Meter } from '../components/shared';
test('mastery meter shows an evidence state, while actual score meters keep percentages', () => {
  const latent = renderToStaticMarkup(<Meter value={0.73} label="学习中" />);
  assert.match(latent, /学习中/);
  assert.doesNotMatch(latent, />73%</);
  assert.match(latent, /aria-hidden="true"/);
  assert.match(latent, /不是答对概率/);
  const actual = renderToStaticMarkup(<Meter value={0.73} />);
  assert.match(actual, />73%</);
});
