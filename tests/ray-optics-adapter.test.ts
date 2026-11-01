import test from 'node:test';
import assert from 'node:assert/strict';
import { traceOptics, traceReflection, traceRefraction } from '../lib/ray-optics-adapter';

const close = (actual: number, expected: number, epsilon = 1e-9) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} != ${expected}`);
const spec = { lens: 'convex' as const, focalLength: 10, objectDistance: 30, objectHeight: 3 };

test('upstream ideal lens rays intersect at the expected real image', () => {
  for (const [distance, x, y] of [[30, 15, -1.5], [20, 20, -3], [15, 30, -6]]) {
    const result = traceOptics({ ...spec, objectDistance: distance });
    assert.ok(result.image);
    close(result.image.tip.x, x);
    close(result.image.tip.y, y);
    assert.equal(result.image.virtual, false);
    for (const ray of result.rays) {
      const out = ray.segments[1];
      close((x - out.from.x) * out.direction.y - (y - out.from.y) * out.direction.x, 0);
      assert.ok(out.direction.x > 0);
    }
  }
});

test('inside focus and concave lens produce upright virtual images and backward extensions', () => {
  for (const [lens, distance, x, y] of [['convex', 5, -10, 6], ['concave', 30, -7.5, 0.75]] as const) {
    const result = traceOptics({ ...spec, lens, objectDistance: distance });
    assert.ok(result.image?.virtual);
    close(result.image.tip.x, x);
    close(result.image.tip.y, y);
    assert.equal(result.rays.length, 3);
    assert.equal(result.rays.flatMap(ray => ray.segments).filter(s => s.virtual).length, result.rays.length);
    close(result.rays.find(ray=>ray.id==='focal')!.segments[1].direction.y,0);
    for (const ray of result.rays) {
      assert.ok(ray.segments[1].direction.x > 0);
      assert.ok(ray.segments[2].direction.x < 0);
    }
  }
});

test('focal object has finite parallel rays and null image', () => {
  const result = traceOptics({ ...spec, objectDistance: 10 });
  assert.equal(result.image, null);
  assert.equal(result.imageAtInfinity, true);
  close(result.rays[0].segments[1].direction.x, result.rays[1].segments[1].direction.x);
  close(result.rays[0].segments[1].direction.y, result.rays[1].segments[1].direction.y);
  for (const ray of result.rays) for (const segment of ray.segments) {
    for (const p of [segment.from, segment.to, segment.direction]) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
  }
});

test('upstream mirror obeys reflection at rotated planes', () => {
  let direction = traceReflection({ x: 1, y: 0 }, 90);
  close(direction.x, -1); close(direction.y, 0);
  direction = traceReflection({ x: 1, y: 0 }, 45);
  close(direction.x, 0); close(direction.y, 1);
  const result = traceOptics({ ...spec, opticalElement: 'mirror' });
  assert.ok(result.image?.virtual);
  close(result.image.tip.x, 30); close(result.image.tip.y, 3);
  assert.equal(result.image.magnification, 1);
  const incoming = { x: Math.cos(0.3), y: Math.sin(0.3) };
  for (const angle of [0, 17, 45, 90, 143]) {
    const reflected = traceReflection(incoming, angle);
    const tangent = { x: Math.cos(angle * Math.PI / 180), y: Math.sin(angle * Math.PI / 180) };
    const normal = { x: -tangent.y, y: tangent.x };
    const dot = (a: typeof incoming, b: typeof incoming) => a.x * b.x + a.y * b.y;
    close(dot(reflected, tangent), dot(incoming, tangent));
    close(dot(reflected, normal), -dot(incoming, normal));
    close(Math.hypot(reflected.x, reflected.y), 1);
  }
});

test('upstream glass follows Snell and conserves Fresnel power', () => {
  const result = traceRefraction(30, 1, 1.5);
  close(result.refractionAngle!, 19.47122063449069);
  close(result.outgoing.y * 1.5, 0.5);
  close(result.reflectedPower + result.transmittedPower, 1);
  const normal = traceRefraction(0, 1, 1.5);
  close(normal.refractionAngle!, 0); close(normal.reflectedPower, 0.04);
  const identical = traceRefraction(-40, 1.33, 1.33);
  close(identical.refractionAngle!, -40); close(identical.reflectedPower, 0);
  const grazing = traceRefraction(89.999, 1, 1.5);
  assert.equal(grazing.totalInternalReflection, false);
  close(grazing.refractionAngle!, Math.asin(Math.sin(89.999 * Math.PI / 180) / 1.5) * 180 / Math.PI);
  assert.ok(grazing.reflectedPower > 0.999);
  close(grazing.transmittedPower + grazing.reflectedPower, 1);
});

test('total internal reflection and below-critical transmission', () => {
  const result = traceRefraction(60, 1.5, 1);
  assert.equal(result.totalInternalReflection, true);
  assert.equal(result.refractionAngle, null);
  close(result.reflectedPower, 1); close(result.transmittedPower, 0);
  close(result.outgoing.x, -0.5);
  const belowCritical = traceRefraction(41, 1.5, 1);
  assert.equal(belowCritical.totalInternalReflection, false);
  assert.ok(belowCritical.refractionAngle! > 79);
  const scene = traceOptics({ ...spec, opticalElement: 'interface', incidenceAngle: 60, refractiveIndex1: 1.5, refractiveIndex2: 1 });
  assert.equal(scene.rays[0].segments.length, 2);
  assert.equal(scene.rays[0].segments[1].kind, 'reflected');
});

test('invalid physical inputs are rejected before invoking numeric methods', () => {
  for (const patch of [{ objectDistance: 0 }, { focalLength: 0 }, { objectHeight: NaN }, { objectDistance: Infinity }]) assert.throws(() => traceOptics({ ...spec, ...patch }), RangeError);
  assert.throws(() => traceRefraction(90), RangeError);
  assert.throws(() => traceRefraction(20, 0), RangeError);
  assert.throws(() => traceReflection({ x: 0, y: 0 }), RangeError);
});
