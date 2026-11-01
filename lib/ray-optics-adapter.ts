import geometry from './vendor/ray-optics/geometry.js';
import { idealLens, mirror, glass } from './vendor/ray-optics/interactions.js';

/** Physical coordinates use y up; lengths share an arbitrary consistent unit. */
export interface OpticsPoint { x: number; y: number }
export interface OpticsSpec {
  lens: 'convex' | 'concave';
  focalLength: number;
  objectDistance: number;
  objectHeight: number;
  opticalElement?: 'lens' | 'mirror' | 'interface';
  /** Plane mirror tangent angle, degrees counterclockwise from +x. Default 90. */
  mirrorAngle?: number;
  refractiveIndex1?: number;
  refractiveIndex2?: number;
  /** Signed incidence in degrees from the +x interface normal. */
  incidenceAngle?: number;
}
export interface OpticsSegment {
  from: OpticsPoint;
  to: OpticsPoint;
  direction: OpticsPoint;
  virtual: boolean;
  kind: 'incident' | 'outgoing' | 'extension' | 'reflected';
  power?: number;
}
export interface OpticsRay { id: string; segments: OpticsSegment[] }
export interface OpticsTrace {
  object: { base: OpticsPoint; tip: OpticsPoint };
  image: { base: OpticsPoint; tip: OpticsPoint; distance: number; height: number; magnification: number; virtual: boolean } | null;
  imageAtInfinity: boolean;
  rays: OpticsRay[];
  focalPoints: OpticsPoint[];
  observations: string[];
  totalInternalReflection?: boolean;
  refractionAngle?: number | null;
}
const point = (x: number, y: number): OpticsPoint => ({ x, y });
const unit = (p: OpticsPoint): OpticsPoint => {
  const length = Math.hypot(p.x, p.y);
  if (!Number.isFinite(length) || length === 0) throw new RangeError('Invalid ray direction');
  return point(p.x / length, p.y / length);
};
const sub = (a: OpticsPoint, b: OpticsPoint) => point(a.x - b.x, a.y - b.y);
const add = (a: OpticsPoint, d: OpticsPoint, length: number) => point(a.x + d.x * length, a.y + d.y * length);
function positive(value: number, name: string) {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be finite and positive`);
  return value;
}
function segment(from: OpticsPoint, to: OpticsPoint, kind: OpticsSegment['kind'], virtual = false, power?: number): OpticsSegment {
  return { from, to, direction: unit(sub(to, from)), virtual, kind, ...(power === undefined ? {} : { power }) };
}

/** Executes upstream Mirror.onRayIncident; the returned vector has unit length. */
export function traceReflection(incoming: OpticsPoint, tangentAngle = 90) {
  if (!Number.isFinite(tangentAngle)) throw new RangeError('Mirror angle must be finite');
  const direction = unit(incoming);
  const angle = tangentAngle * Math.PI / 180;
  const ray = { p1: point(-direction.x, -direction.y), p2: point(0, 0) };
  mirror.onRayIncident.call({ p1: point(0, 0), p2: point(Math.cos(angle), Math.sin(angle)) }, ray, 0, point(0, 0));
  return unit(sub(ray.p2, ray.p1));
}

/** Parallel-ray preset delegates each actual interaction to upstream IdealLens. */
export function traceParallelLens(kind:'convex'|'concave',focalLength:number){
 const f=positive(focalLength,'Focal length'),lens={p1:point(0,-3*f),p2:point(0,3*f),focalLength:kind==='convex'?f:-f};
 return [-.65,0,.65].map((fraction,i)=>{const from=point(-2.2*f,fraction*f),hit=point(0,fraction*f),ray={p1:from,p2:hit};idealLens.onRayIncident.call(lens,ray,i,hit);const direction=unit(sub(ray.p2,ray.p1));return {incident:segment(from,hit,'incident'),outgoing:segment(hit,add(hit,direction,2.3*f),'outgoing')};});
}

/** Single boundary at x=0; Fresnel powers from upstream BaseGlass.refract. */
export function traceRefraction(incidenceAngle: number, index1 = 1, index2 = 1.5) {
  positive(index1, 'Incident refractive index');
  positive(index2, 'Transmitted refractive index');
  if (!Number.isFinite(incidenceAngle) || Math.abs(incidenceAngle) >= 90) throw new RangeError('Incidence angle must lie between -90 and 90 degrees');
  const angle = incidenceAngle * Math.PI / 180;
  const incoming = point(Math.cos(angle), Math.sin(angle));
  const ray = { p1: point(-incoming.x, -incoming.y), p2: point(0, 0), brightness_s: 0.5, brightness_p: 0.5, wavelength: 540, gap: true };
  const result = glass.refract.call({ partialReflect: true, scene: { colorMode: 'linear', rayPowerCutoff: 0, rayPowerSampling: false } }, ray, 0, point(0, 0), point(-1, 0), index1 / index2, [], null);
  const outgoing = unit(sub(ray.p2, ray.p1));
  const totalInternalReflection = outgoing.x < 0;
  // Upstream geometry.Line's JSDoc omits power fields added by refract.
  const reflected = result?.newRays?.[0] as ({ p1: OpticsPoint; p2: OpticsPoint; brightness_s: number; brightness_p: number } | undefined);
  return {
    incoming,
    outgoing,
    totalInternalReflection,
    refractionAngle: totalInternalReflection ? null : Math.atan2(outgoing.y, outgoing.x) * 180 / Math.PI,
    transmittedPower: totalInternalReflection ? 0 : ray.brightness_s + ray.brightness_p,
    reflectedPower: totalInternalReflection ? 1 : reflected ? reflected.brightness_s + reflected.brightness_p : 0,
    reflectedDirection: totalInternalReflection ? outgoing : reflected ? unit(sub(reflected.p2, reflected.p1)) : null,
  };
}

export function traceOptics(spec: OpticsSpec): OpticsTrace {
  const distance = positive(spec.objectDistance, 'Object distance');
  if (!Number.isFinite(spec.objectHeight) || spec.objectHeight === 0) throw new RangeError('Object height must be finite and nonzero');
  const height = spec.objectHeight;
  const tip = point(-distance, height);
  const object = { base: point(-distance, 0), tip };
  const extent = Math.max(distance, Math.abs(height), Math.abs(spec.focalLength) || 1) * 2;
  if (!Number.isFinite(extent)) throw new RangeError('Optics dimensions are too large');

  if (spec.opticalElement === 'interface') {
    const result = traceRefraction(spec.incidenceAngle ?? 30, spec.refractiveIndex1 ?? 1, spec.refractiveIndex2 ?? 1.5);
    const origin = point(0, 0);
    const segments: OpticsSegment[] = [segment(add(origin, result.incoming, -distance), origin, 'incident'), segment(origin, add(origin, result.outgoing, extent), result.totalInternalReflection ? 'reflected' : 'outgoing', false, result.totalInternalReflection ? 1 : result.transmittedPower)];
    if (!result.totalInternalReflection && result.reflectedDirection && result.reflectedPower > 0) segments.push(segment(origin, add(origin, result.reflectedDirection, extent), 'reflected', false, result.reflectedPower));
    return { object, image: null, imageAtInfinity: false, rays: [{ id: 'boundary', segments }], focalPoints: [], observations: [result.totalInternalReflection ? '全反射：没有透射光线。' : `折射角 ${result.refractionAngle!.toFixed(2)}°（相对法线）。`], totalInternalReflection: result.totalInternalReflection, refractionAngle: result.refractionAngle };
  }
  if (spec.opticalElement === 'mirror') {
    const angle = spec.mirrorAngle ?? 90;
    const radians = angle * Math.PI / 180;
    const tangent = point(Math.cos(radians), Math.sin(radians));
    const normal = point(-tangent.y, tangent.x);
    const reflectPoint = (p: OpticsPoint) => add(p, normal, -2 * (p.x * normal.x + p.y * normal.y));
    const imageTip = reflectPoint(tip);
    const rays = [-0.35, 0.35].map((offset, i) => {
      const hit = add(point(0, 0), tangent, offset * distance);
      const outgoing = traceReflection(sub(hit, tip), angle);
      return { id: `mirror-${i}`, segments: [segment(tip, hit, 'incident'), segment(hit, add(hit, outgoing, extent), 'reflected'), segment(hit, imageTip, 'extension', true)] };
    });
    return { object, image: { base: reflectPoint(object.base), tip: imageTip, distance, height, magnification: 1, virtual: true }, imageAtInfinity: false, rays, focalPoints: [], observations: ['平面镜成等大虚像；虚线为反射光线的反向延长线。'] };
  }

  const focal = positive(Math.abs(spec.focalLength), 'Focal length') * (spec.lens === 'concave' ? -1 : 1);
  const lens = { p1: point(0, -extent), p2: point(0, extent), focalLength: focal };
  // These two independent incident rays are transformed by upstream code.
  // The image is their intersection, rather than a separately evaluated lens equation.
  const focusX=spec.lens==='convex'?-Math.abs(focal):Math.abs(focal),throughFocus=height*focusX/(distance+focusX);
  const hitHeights=[height,0,...(Number.isFinite(throughFocus)&&Math.abs(throughFocus)<extent*4?[throughFocus]:[])];
  const traced = hitHeights.map((hitHeight, i) => {
    const hit = point(0, hitHeight);
    const ray = { p1: { ...tip }, p2: hit };
    idealLens.onRayIncident.call(lens, ray, i, hit);
    return { hit, direction: unit(sub(ray.p2, ray.p1)) };
  });
  const a = traced[0], b = traced[1];
  const determinant = a.direction.x * b.direction.y - a.direction.y * b.direction.x;
  const imageAtInfinity = Math.abs(determinant) <= 1e-10*Math.max(Math.abs(a.direction.y),Math.abs(b.direction.y),Number.MIN_VALUE);
  const intersection = imageAtInfinity ? null : geometry.linesIntersection({ p1: a.hit, p2: add(a.hit, a.direction, 1) }, { p1: b.hit, p2: add(b.hit, b.direction, 1) });
  if (intersection && (!Number.isFinite(intersection.x) || !Number.isFinite(intersection.y))) throw new RangeError('Image coordinates exceed numerical range');
  const virtual = !!intersection && intersection.x < 0;
  const image = intersection ? { base: point(intersection.x, 0), tip: intersection, distance: intersection.x, height: intersection.y, magnification: intersection.y / height, virtual } : null;
  const rays = traced.map(({ hit, direction }, i) => ({
    id: i === 0 ? 'parallel' : i===1?'central':'focal',
    segments: [segment(tip, hit, 'incident'), segment(hit, add(hit, direction, Math.max(extent, intersection && !virtual ? Math.hypot(intersection.x, intersection.y - hit.y) * 1.15 : 0)), 'outgoing'), ...(virtual && intersection ? [segment(hit, intersection, 'extension', true)] : [])],
  }));
  return { object, image, imageAtInfinity, rays, focalPoints: [point(-Math.abs(focal), 0), point(Math.abs(focal), 0)], observations: [imageAtInfinity ? '物体在焦平面：出射光线平行，像在无穷远。' : virtual ? '出射光线发散；反向延长线交于正立虚像。' : '出射光线相交，形成倒立实像。'] };
}
