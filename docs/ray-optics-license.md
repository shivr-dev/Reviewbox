# Ray Optics computational integration

Source: [ricktu288/ray-optics](https://github.com/ricktu288/ray-optics), pinned at
[`9dd7706097ec8b93171e04e7985be12c3309533c`](https://github.com/ricktu288/ray-optics/tree/9dd7706097ec8b93171e04e7985be12c3309533c).
Retrieved 2026-10-31. This is the upstream HEAD observed during integration, not an automatically updating dependency.

License: Apache-2.0, full unmodified license in `lib/vendor/ray-optics/LICENSE`.
Copyright 2024/2026 The Ray Optics Simulation authors and contributors, as retained in the source headers.
No upstream NOTICE file was present in the pinned repository tree.

## Vendored dependency closure

- `geometry.js`: byte-for-byte copy of upstream `src/core/geometry.js` (9,353 bytes).
- `rayPower.js`: byte-for-byte copy of upstream `src/core/simulationEngines/rayPower.js` (1,430 bytes).
- `interactions.js`: explicitly modified extraction of the complete `onRayIncident` method bodies from `src/core/sceneObjs/glass/IdealLens.js` and `src/core/sceneObjs/mirror/Mirror.js`, plus the complete `refract` method body from `src/core/sceneObjs/BaseGlass.js`. The original method bodies are unchanged; only their containing classes and UI imports were replaced by exported plain objects and local imports (7,897 bytes).
- `LICENSE`: 11,358 bytes.

Total vendored JavaScript: 18,680 bytes. Total vendored files including license: 30,038 bytes. No runtime packages added.

The upstream scene classes import translation, rendering, scene editing, formula parsing and other simulation machinery. Extracting their independent numerical methods avoids shipping that dependency graph. This application invokes the upstream methods directly: ideal lens rays are transformed using upstream geometry, their intersection determines the image, the mirror uses upstream reflection, and a boundary uses upstream Snell/Fresnel computation including total internal reflection. There is no iframe, simulator UI, or additional drawing library.

## Adapter conventions and limits

`lib/ray-optics-adapter.ts` returns physical coordinates with y up, centered optical element and object at x = minus object distance. Lengths use a common arbitrary unit. Convex lens focal length is positive and concave negative regardless of the supplied focal length sign. Two principal rays determine an ideal, thin lens image; the focal case returns `image: null` and `imageAtInfinity: true`. Dashed virtual extensions are separately flagged. This is ideal geometric optics, not diffraction or an aberration model.

The `mirror` mode represents a plane mirror; `mirrorAngle` is its tangent angle in degrees counterclockwise from +x (90 by default). The `interface` mode represents one planar boundary x=0: incidence angle is signed degrees from the +x normal, with positive refractive indices. It returns refraction angle and total internal reflection status, with Fresnel reflected/transmitted powers. It does not claim a point image for a single boundary. Its incident ray start is set by the specified angle; the generic object marker is retained as input metadata.

Verification: `node --test --experimental-strip-types tests/ray-optics-adapter.test.ts` checks real and virtual lens images, focal infinity, ray direction, rotated reflection, plane mirror image, Snell angles, Fresnel energy conservation, total internal reflection and invalid inputs. No browser globals are needed to import or run this adapter.
