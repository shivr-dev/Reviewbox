# Biology engines: bounded primary-source research

Verified 2026-11-01. Research and temporary asset curation only; no package or runtime integration was performed by this research task.

## Role of each engine

- Bioicons: searchable, attributed SVG illustration building blocks. An icon is not a molecule, anatomical segmentation model or measured structure. Placing and resizing it does not imply a simulation or scientific relationship.
- Mol*: macromolecular coordinates and assemblies, e.g. PDB/mmCIF proteins and nucleic acids. Keep this lazy and distinct from the existing 3Dmol small-molecule workflow.
- Existing Cytoscape: explicitly authored biological relationship nodes and edges. Edges require user/source semantics; do not infer pathways or containment from the presence of an icon.

These role boundaries are product recommendations. Mol* upstream describes its focus as macromolecular structure data in its [README](https://github.com/molstar/molstar/blob/v5.13.1/README.md).

## Bioicons source and schema

Pinned revision: `d29e766ea7580b8063c4f47b29e872db40a4d979` ([commit](https://github.com/duerrsimon/bioicons/commit/d29e766ea7580b8063c4f47b29e872db40a4d979)).

[static/icons/icons.json](https://github.com/duerrsimon/bioicons/blob/d29e766ea7580b8063c4f47b29e872db40a4d979/static/icons/icons.json) is a JSON array with 2,804 entries at this revision. Its actual fields are `name`, `category`, `license`, `author`. It does not supply structural molecular coordinates or a relationship graph. [authors.json](https://github.com/duerrsimon/bioicons/blob/d29e766ea7580b8063c4f47b29e872db40a4d979/static/icons/authors.json) maps author identity to a creator URL. Some authors have empty or non-HTTP values, so author URL cannot be universally assumed valid.

The [contribution guide](https://github.com/duerrsimon/bioicons/blob/d29e766ea7580b8063c4f47b29e872db40a4d979/CONTRIBUTING.md) documents the path structure `static/icons/{license}/{category}/{author}/{name}.svg`. The original [Icon.vue](https://github.com/duerrsimon/bioicons/blob/d29e766ea7580b8063c4f47b29e872db40a4d979/components/Icon.vue) replaces spaces in author folder names with underscores and maps license IDs to explicit license URLs. Existing categories and names contain underscores; use readable labels for display while preserving upstream fields.

Do not treat the root MIT LICENSE as an artwork-wide license: [README credits](https://github.com/duerrsimon/bioicons/blob/d29e766ea7580b8063c4f47b29e872db40a4d979/README.md#credits) explicitly request individual icon/license citation and change disclosure for CC BY modifications.

Temporary curated files: `work/bioicons-curated/` relative to the task workspace (outside the app source). `manifest.json` contains nine assets and their exact per-item source URL, creator, creator URL, license URL, revision, original name/category/license/author, bytes, SHA-256 and viewBox. Total SVG bytes: 826,709. `ATTRIBUTION.md` carries copyable per-item notices. No full SVG repository download took place.

| Artwork | Creator | License |
| --- | --- | --- |
| [simple_cell1](https://github.com/duerrsimon/bioicons/blob/d29e766ea7580b8063c4f47b29e872db40a4d979/static/icons/cc-0/Cell_types/Marnie-Maddock/simple_cell1.svg) | [Marnie-Maddock](https://github.com/MarnieMaddock) | [cc-0](https://creativecommons.org/publicdomain/zero/1.0/) |
| [nucleus](https://github.com/duerrsimon/bioicons/blob/d29e766ea7580b8063c4f47b29e872db40a4d979/static/icons/cc-by-3.0/Intracellular_components/Servier/nucleus.svg) | [Servier](https://smart.servier.com/) | [cc-by-3.0](https://creativecommons.org/licenses/by/3.0/) |
| [Endoplasmic_Reticulum](https://github.com/duerrsimon/bioicons/blob/d29e766ea7580b8063c4f47b29e872db40a4d979/static/icons/cc-0/Intracellular_components/jaiganesh/Endoplasmic_Reticulum.svg) | [jaiganesh](https://github.com/jaiganeshjg) | [cc-0](https://creativecommons.org/publicdomain/zero/1.0/) |
| [mitochondria](https://github.com/duerrsimon/bioicons/blob/d29e766ea7580b8063c4f47b29e872db40a4d979/static/icons/cc-0/Intracellular_components/jaiganesh/mitochondria.svg) | [jaiganesh](https://github.com/jaiganeshjg) | [cc-0](https://creativecommons.org/publicdomain/zero/1.0/) |
| [ribosome](https://github.com/duerrsimon/bioicons/blob/d29e766ea7580b8063c4f47b29e872db40a4d979/static/icons/cc-0/Intracellular_components/jaiganesh/ribosome.svg) | [jaiganesh](https://github.com/jaiganeshjg) | [cc-0](https://creativecommons.org/publicdomain/zero/1.0/) |
| [golgi-2d-1](https://github.com/duerrsimon/bioicons/blob/d29e766ea7580b8063c4f47b29e872db40a4d979/static/icons/cc-by-3.0/Intracellular_components/Servier/golgi-2d-1.svg) | [Servier](https://smart.servier.com/) | [cc-by-3.0](https://creativecommons.org/licenses/by/3.0/) |
| [Pipette](https://github.com/duerrsimon/bioicons/blob/d29e766ea7580b8063c4f47b29e872db40a4d979/static/icons/cc-0/Lab_apparatus/James-Lloyd/Pipette.svg) | [James-Lloyd](https://www.badgrammargoodsyntax.com/) | [cc-0](https://creativecommons.org/publicdomain/zero/1.0/) |
| [erlenmeyer_filled](https://github.com/duerrsimon/bioicons/blob/d29e766ea7580b8063c4f47b29e872db40a4d979/static/icons/cc-0/Lab_apparatus/KeHan/erlenmeyer_filled.svg) | [KeHan](https://github.com/kehantan) | [cc-0](https://creativecommons.org/publicdomain/zero/1.0/) |
| [Beakers](https://github.com/duerrsimon/bioicons/blob/d29e766ea7580b8063c4f47b29e872db40a4d979/static/icons/cc-0/Lab_apparatus/Xavax/Beakers.svg) | [Xavax](https://commons.wikimedia.org/wiki/User_talk:Xavax) | [cc-0](https://creativecommons.org/publicdomain/zero/1.0/) |

All nine passed XML parsing with external entity resolution disabled and checks rejecting executable elements, event attributes, external href/src, external CSS url(), entity declarations, @import, javascript/data schemes and embedded image/raster elements. Original bytes were preserved after validation. SVG fragment references remain supported. A candidate `Animal_cells` was rejected for an external href and not saved; `Plant_cells` was not downloaded. A production upload path still needs its own SVG sanitizer; this check covers only these pinned curated files.

## Mol* stable API and version

The official repository's current master is a v6 workspace prototype with different paths. Use pinned stable `molstar@5.13.1`, tag commit `a4e9cc79415213263090ee47bf380d2a33e0118e`; do not mix master instructions into classic `molstar/lib/...` imports. [Stable package.json](https://github.com/molstar/molstar/blob/v5.13.1/package.json) declares MIT, Node >=22.0.0 for package tooling and React/react-dom peers >=16.14.0; upstream dev integration uses React 18.3.1. [Registry metadata](https://registry.npmjs.org/molstar/5.13.1) reports 84,403,410 unpacked bytes and 6,508 files. This is package footprint, not final browser transfer size; measure the lazy browser chunk after integration. Registry integrity: `sha512-iExD98bJN2P4JK6+pVMwdJlPePldBH8oNT0pZhs8ucxOp086NU2b/gThKwYMC3SWkdmv++a1g4fGwKfu4Glx1w==`.

[MIT license](https://github.com/molstar/molstar/blob/v5.13.1/LICENSE): retain the Mol* contributors copyright and permission notice in redistributed copies/substantial portions. The [README](https://github.com/molstar/molstar/blob/v5.13.1/README.md) also requests the Mol* Viewer 2021 paper citation.

### Minimal lazy UI, PDB load and cleanup

The factory is `DefaultPluginUISpec()`, not `createPluginUISpec()`. Verified against [UI entry](https://github.com/molstar/molstar/blob/v5.13.1/src/mol-plugin-ui/index.ts), [UI spec](https://github.com/molstar/molstar/blob/v5.13.1/src/mol-plugin-ui/spec.ts), [basic wrapper](https://github.com/molstar/molstar/blob/v5.13.1/src/examples/basic-wrapper/index.ts) and [PDB loader](https://github.com/molstar/molstar/blob/v5.13.1/src/extensions/plugin/loaders.ts).

```ts
// Put in the lazy viewer module. CSS needs Sass support.
import 'molstar/lib/mol-plugin-ui/skin/light.scss';
import { createRoot, type Root } from 'react-dom/client';

export async function mountMacromolecule(target: HTMLElement, pdbId: string) {
  const [{ createPluginUI }, { DefaultPluginUISpec }, { loadPdb }] =
    await Promise.all([
      import('molstar/lib/mol-plugin-ui'),
      import('molstar/lib/mol-plugin-ui/spec'),
      import('molstar/lib/extensions/plugin/loaders'),
    ]);
  let uiRoot: Root | undefined;
  const plugin = await createPluginUI({
    target,
    render(element, container) {
      uiRoot = createRoot(container);
      uiRoot.render(element);
    },
    spec: {
      ...DefaultPluginUISpec(),
      layout: { initial: { isExpanded: false, showControls: false } },
      components: { remoteState: 'none' },
    },
  });
  try {
    await loadPdb(plugin, pdbId);
  } catch (error) {
    uiRoot?.unmount();
    plugin.dispose();
    throw error;
  }
  return {
    plugin,
    dispose() {
      uiRoot?.unmount();
      plugin.dispose();
    },
  };
}
```

The host must have nonzero dimensions and handle WebGL initialization errors and external PDB network failure. The official [renderReact18](https://github.com/molstar/molstar/blob/v5.13.1/src/mol-plugin-ui/react18.ts) can be used directly as `render: renderReact18`; the custom callback above captures the React root so cleanup can unmount it. [PluginContext.dispose](https://github.com/molstar/molstar/blob/v5.13.1/src/mol-plugin/context.ts) stops animation, unsubscribes and releases viewer resources. Parent-component cancellation must dispose a late-resolving plugin too.

`loadPdb(plugin, pdbId)` waits for initialization and uses the configured PDB download provider. No claim that every PDB ID exists or is accessible is implied. Validate a four-character PDB ID or use an explicit format/source chooser as needed. For an explicit local/remote mmCIF source, the official basic-wrapper sequence is data.download with Asset.Url, builders.structure.parseTrajectory(data, 'mmcif'), then hierarchy.applyPreset(trajectory, 'default', { structure:{name:'model',params:{}}, showUnitcell:false, representationPreset:'auto' }). A new source should clear the prior structure first if replacing it.

### PNG snapshot

Verified [ViewportScreenshotHelper](https://github.com/molstar/molstar/blob/v5.13.1/src/mol-plugin/util/viewport-screenshot.ts): `plugin.helpers.viewportScreenshot` is optional. Its default format is PNG; to force PNG then obtain a data URI:

```ts
const screenshot = plugin.helpers.viewportScreenshot;
if (!screenshot) throw new Error('Screenshot capture is unavailable');
screenshot.behaviors.values.next({
  ...screenshot.values,
  format: { name: 'png', params: {} },
});
const pngDataUri = await screenshot.getImageDataUri();
```

The helper renders via a task and returns canvas.toDataURL('image/png'). This code was verified against source, not executed in a browser during research. Capture only after a structure has loaded and the viewer has initialized; surface failures without substituting an inferred biological model.

