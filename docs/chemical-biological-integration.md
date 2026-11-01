# Chemistry and biology integration

The external authoring Skill is version 4.0. Its chemistry/biology section is in lib/chemical-skill.ts and is appended to the existing IMPORT_SKILL, not a separate incompatible pack format. The product copy button and full text use the same constant.

## Runtime responsibility
- RDKit 2026.9.1: parse single selected SMILES/MOL/SDF record; real SVG, formula and mass; WASM objects released in finally.
- 3Dmol 2.5.5: supplied conformers only; RDKit must identify dimension 3 before display. Ball-stick, spacefill, VDW surface and atom picking; PNG snapshot export.
- Ketcher 3.18.0: optional authoring dialog; standalone local Indigo; edited MOL rechecked by RDKit.
- Bioicons: 63 pinned original SVGs, Chinese names, category/license filters and search, 18 per page; author/source/individual license retained in SVG and document captions. No arbitrary asset URLs.
- Cytoscape 3.34.4: explicit food-web/network topology and preset positions; Reviewbox renders exact vector positions. Does not infer biology.
- Molstar 5.13.1: PDB accession loading for macromolecular structures; separate lazy chunk and CSS, PNG snapshot export; online data and WebGL required.

All new engines are page-lazy. RDKit glue/WASM are prepared from the pinned dependency at build time; no imported learning package can execute engine JavaScript. Existing JSXGraph/Ray Optics routes remain. Pack schemaVersion stays 1.

## Licenses
- RDKit and 3Dmol: BSD-3-Clause.
- Ketcher and Indigo: Apache-2.0, Ketcher NOTICE included.
- Molstar and Cytoscape: MIT.
- Bioicons: per-asset CC0 / CC BY 3.0 / CC BY 4.0, not the repository website code license. Full catalog and public/bioicons/ATTRIBUTION.md carry individual provenance.
- Build emits assets/third-party-licenses.txt for bundled dependencies, plus public/licenses/science for separately distributed engines.

Node >=24.14.1 is required by Ketcher 3.18.0; Pages workflow uses Node 24. No demo questions are seeded or published: local QA entry and cases remain under ignored work/. Skill JSON snippets are documentation only.

## Current evidence and limits
Type checking and Pages build passed before the last catalog/documentation expansion. RDKit actual WASM tests passed for ethanol formula/mass, rejected invalid chemistry/2D-as-3D, and selected SDF records. Browser rendered RDKit ethanol, 3Dmol chloromethane from upstream supplied coordinates, and Molstar 1CRN. User subsequently asked to stop further verification; no additional browser acceptance is claimed.

Small-molecule surface is geometric VDW, not measured electrostatic potential. Molstar data retrieval needs connectivity. Provenance fields are author assertions and still require human scientific review. Parsing valid structure is not proof that a question or experimental claim is correct.
