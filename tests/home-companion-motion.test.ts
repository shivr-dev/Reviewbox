import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HOME_COMPANION_MOTION,
  homeCompanionFrame,
  homeSpritePose,
  homeFallbackPeriod,
} from '../lib/home-companion-motion';
import { companionMotion } from '../lib/companion-motion';
import { createRequire } from 'node:module';
const sharp = createRequire(import.meta.url)('sharp');

for (const pose of ['read', 'water'] as const) {
  test(`home ${pose}: all eight frames finish, final frame rests, then next cycle starts`, () => {
    const m = HOME_COMPANION_MOTION[pose];
    let time = 0;
    for (let frame = 0; frame < 8; frame++) {
      assert.equal(homeCompanionFrame(pose, time).frame, frame);
      assert.equal(
        homeCompanionFrame(pose, time + m.durations[frame] - 1).frame,
        frame,
      );
      time += m.durations[frame];
    }
    assert.equal(homeCompanionFrame(pose, time).frame, 7);
    assert.equal(homeCompanionFrame(pose, time).resting, true);
    assert.equal(homeCompanionFrame(pose, time + m.pause - 1).frame, 7);
    assert.equal(homeCompanionFrame(pose, time + m.pause).frame, 0);
    assert.equal(homeCompanionFrame(pose, time + m.pause).cycle, 1);
  });
  test(`home ${pose}: reduced motion is stable; atlas has genuine alpha and square cells`, async () => {
    assert.equal(homeCompanionFrame(pose, 100000, true).frame, 0);
    assert.equal(homeCompanionFrame(pose, -1).frame, 0);
    assert.equal(homeCompanionFrame(pose, NaN).frame, 0);
    const { data, info } = await sharp(
      'public/' + HOME_COMPANION_MOTION[pose].file,
    )
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    assert.equal(info.width / 4, info.height / 2);
    let transparent = 0,
      opaque = 0;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] === 0) transparent++;
      if (data[i] >= 200) opaque++;
    }
    assert.ok(transparent > info.width * info.height * 0.25);
    assert.ok(opaque > info.width * info.height * 0.1);
  });
}
test('home outfits preserve original outfit atlases and allow full action before repeating', () => {
  for (const skin of [
    'skin-super',
    'skin-explorer',
    'skin-raincoat',
    'skin-astronaut',
    'skin-graduate',
    'skin-scientist',
  ]) {
    assert.equal(homeSpritePose('read', skin), null);
    assert.equal(homeSpritePose('water', skin), null);
    assert.ok(
      homeFallbackPeriod('read', skin) >
        companionMotion('thinking', skin).duration,
    );
    assert.ok(
      homeFallbackPeriod('dance', skin) >
        companionMotion('combo', skin).duration,
    );
  }
  assert.equal(homeSpritePose('read', 'default'), 'read');
  assert.equal(homeSpritePose('water', 'default'), 'water');
});
