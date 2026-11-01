# Chemical engine API research

Verified 2026-11-01 against official documentation/source and published package metadata. Research only: no dependency installation or runtime edits. Patterns below require normal integration/build/browser verification.

## RDKit.js

Current npm metadata reports `@rdkit/rdkit@2026.9.1`. Its exported types are `MainModule` and `Mol`; the default factory returns `Promise<MainModule>`. Older examples naming `RDKitModule`/`JSMol` may not type-check against this release. The package export for the WASM asset is `@rdkit/rdkit/RDKit_minimal.wasm`; implementation files reside under `dist`. [Published types](https://unpkg.com/@rdkit/rdkit@2026.9.1/dist/RDKit_minimal.d.ts), [package metadata](https://registry.npmjs.org/@rdkit%2Frdkit/2026.9.1).

The official browser example passes `locateFile` to resolve the separately emitted WASM. Cache the initialization promise per client runtime; reset a rejected promise to permit retry. Load inside a client effect/worker, keeping SSR from evaluating browser glue. The official repository warns that static analysis of Node branches in the glue can break some bundlers. If encountered, copy the pinned glue and matching WASM to same-origin static assets and load the glue script in the browser. Respect deployment base paths. [Official React example](https://rdkit.github.io/rdkit-js/examples/react/), [official repository](https://github.com/rdkit/rdkit-js).

```ts
import initRDKit, {type MainModule} from '@rdkit/rdkit';
import wasmUrl from '@rdkit/rdkit/RDKit_minimal.wasm?url';
let pending: Promise<MainModule> | undefined;
const load = () => pending ??= initRDKit({locateFile: () => wasmUrl})
  .catch(error => { pending = undefined; throw error; });
async function inspect(input: string) {
  const rdkit = await load();
  const mol = rdkit.get_mol(input);
  if (!mol) throw new Error('Invalid molecular structure');
  try {
    if (!mol.is_valid()) throw new Error('Invalid molecular structure');
    return {svg: mol.get_svg(520, 320), smiles: mol.get_smiles(),
      descriptors: JSON.parse(mol.get_descriptors()), version: rdkit.version()};
  } finally { mol.delete(); }
}
```

Exact checked methods: `get_mol(input[,details_json])` returns `Mol|null`; `get_svg()` or `get_svg(width,height)` returns SVG text; `get_svg_with_highlights(details_json)` supports drawing options; `get_smiles([details_json])`, `get_molblock([details_json])`, and `get_descriptors()` return strings. JSON options are strings, not arbitrary JS objects. `get_descriptors()` includes `amw` in the official example. Delete every independently owned molecule/query/copy in `finally`; JavaScript garbage collection does not substitute for releasing WASM handles. [Bindings](https://raw.githubusercontent.com/rdkit/rdkit/master/Code/MinimalLib/jswrapper.cpp), [example and disposal guidance](https://github.com/rdkit/rdkit-js).

`get_mol` accepts a single SMILES or MDL molecule block. It is not an SDF collection loader: split records explicitly or reject multiple records. Keep original header line positions; trimming leading newlines can damage MOL counts-line positioning. Preserve input and chemical identity separately from canonical SMILES/derived descriptors. Do not claim 3D coordinates from a 2D depiction. [Maintainer explanation](https://github.com/rdkit/rdkit-js/discussions/358), [parser implementation](https://raw.githubusercontent.com/rdkit/rdkit/master/Code/MinimalLib/common.h).

## 3Dmol.js

Current published version is `3dmol@2.5.5`, main `build/3Dmol.js`, with bundled declarations. Official docs show `import('3dmol/build/3Dmol.js')`; load only when a 3D view is opened. Browser module interop should be checked for the selected bundler: choose the namespace when it has `createViewer`, otherwise its default export. [Official import guidance](https://3dmol.org/doc/), [package source](https://raw.githubusercontent.com/3dmol/3Dmol.js/master/package.json).

```ts
const imported = await import('3dmol/build/3Dmol.js');
const api = typeof imported.createViewer === 'function' ? imported : imported.default;
const viewer = api.createViewer(host, {backgroundColor: 'white'});
if (!viewer) throw new Error('3D graphics unavailable');
const model = viewer.addModel(molBlock, 'sdf', {keepH: true});
const atoms = model.selectedAtoms({});
if (!atoms.length || atoms.length > atomLimit ||
    atoms.some(a => ![a.x,a.y,a.z].every(Number.isFinite))) {
  viewer.clear(); throw new Error('Invalid coordinates');
}
viewer.setStyle({}, {stick: {radius: .15}, sphere: {scale: .25}});
viewer.zoomTo(); viewer.render();
const pngDataUrl = viewer.pngURI();
```

Use `sdf` for both a MOL block and SDF: the parser registry does not register a `mol` alias, and an unknown format invokes content guessing. Multi-record SDF needs explicit selection or `addModels`, not accidental first-record display. The parser reads coordinate fields directly; successful `addModel` is not a chemical or numeric validator. Validate atom count, finite coordinates and the expected record before rendering. A planar valid molecule may have all z=0, so this is not by itself a failure; provenance must distinguish 2D layout from supplied/generated 3D conformer. These checks and provenance policy are application recommendations derived from the parser. [Registry](https://raw.githubusercontent.com/3dmol/3Dmol.js/master/src/parsers/index.ts), [SDF parser](https://raw.githubusercontent.com/3dmol/3Dmol.js/master/src/parsers/SDF.ts).

Styles use an atom selection followed by a style: `setStyle({elem:'O'},{sphere:{scale:.4},stick:{radius:.15}})` targets oxygen. Export is `pngURI()`, not `exportPNG()`. Public cleanup includes `stopAnimate()`, `spin(false)` and `clear()`; clear removes surfaces/models/labels/shapes. No public `GLViewer.dispose()` or `destroy()` was found. Remove application observers/callbacks and detach the canvas on unmount; that alone is not proof that all GPU/listener resources were released. Prefer a reused viewer and verify repeated mount/unmount behavior in a real browser. [Model selection/style](https://raw.githubusercontent.com/3dmol/3Dmol.js/master/src/GLModel.ts), [viewer implementation](https://raw.githubusercontent.com/3dmol/3Dmol.js/master/src/GLViewer.ts).

## Optional Ketcher

Published `ketcher-react@3.18.0` and `ketcher-standalone@3.18.0` require Node >=24.14.1; this repository advertises Node >=22.13. React 18/19 peers are supported. Current master is a newer release candidate, so do not copy its version assumptions into a pinned install. Keep editor dependencies behind an optional authoring route, with lazy JS/CSS and static assets; a regular static import still resolves and bundles them even if a feature flag later hides the UI. Ketcher React includes MUI, Lexical, Paper, Miew and other dependencies; standalone adds Indigo WASM. [Published React metadata](https://registry.npmjs.org/ketcher-react/3.18.0), [published standalone metadata](https://registry.npmjs.org/ketcher-standalone/3.18.0), [official package manifests](https://raw.githubusercontent.com/epam/ketcher/master/packages/ketcher-react/package.json).

Official embedding uses `Editor` from `ketcher-react`, `StandaloneStructServiceProvider` from `ketcher-standalone`, `ketcher-react/dist/index.css`, and `staticResourcesUrl` for the copied resources. Initialize the provider once per mounted editor. Remote mode instead requires an Indigo service; do not introduce it merely to draw a structure. Exported editor MOL/SMILES should pass the same validation as imports. [Official embedding instructions](https://raw.githubusercontent.com/epam/ketcher/master/packages/ketcher-react/README.md).

## Distribution notes

RDKit and 3Dmol are BSD-3-Clause: retain the license/copyright/disclaimer in distributed source and accompanying binary materials; do not imply endorsement. 3Dmol's license also records incorporated GLmol, Three.js and jQuery notices; ship the full notice file. RDKit MinimalLib is a subset of RDKit, not the complete Python API. [RDKit license](https://raw.githubusercontent.com/rdkit/rdkit/master/license.txt), [MinimalLib scope](https://raw.githubusercontent.com/rdkit/rdkit/master/Code/MinimalLib/README.md), [3Dmol license](https://raw.githubusercontent.com/3dmol/3Dmol.js/master/LICENSE).

Ketcher is Apache-2.0: distribute its license, preserve applicable attribution and NOTICE text, and mark modified files. Include applicable licenses of actually redistributed transitive dependencies/assets. A software license does not provide provenance or permission for externally supplied molecular datasets. [Ketcher license](https://raw.githubusercontent.com/epam/ketcher/master/LICENSE).
