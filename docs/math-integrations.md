# Math tools and professional diagrams

Integrated into existing question/import flows, with no parallel grading system.

## Dependencies and licenses

- JSXGraph 1.14.2: MIT option of dual MIT/LGPL license. Loaded only with mathematical diagrams.
- Ray Optics: Apache-2.0, pinned extraction documented in ray-optics-license.md. No simulator UI.
- MathLive 0.111.1: MIT. Client-only formula editing; deployed fonts are copied locally by prepare-math-assets.mjs.
- Compute Engine 0.173.0: MIT. This version supports the project's Node 22/24 baseline; newer 0.174/0.175 require Node 26.13.
- JSONRepair 3.15.0: ISC. Local, bounded worker; no third-party repair service.
- Word export was cancelled by the user. docx is not a dependency.

Full notices are distributed under public/licenses. Upstream Ray Optics code and its license are retained under lib/vendor/ray-optics.

## Boundaries

- MathAnswerInput edits LaTeX; MathAnswerComposer preserves explicit text/latex/mixed formats. Historical answers remain text unless explicitly switched. KaTeX still displays read-only formulas.
- verifyMathAnswer returns equivalent, not-equivalent or undetermined. Original AST domain restrictions are checked before simplification. Exact counterexamples can disprove identity; sample agreement never proves identity. Units and unsupported expressions require review. Subjective Rubric and Qwen grading remain unchanged.
- repairImportJson preserves original and repaired text. Repairs require confirmation before the existing content/version preview. Truncated text values are rejected. ZIP media checks and Zod validation remain mandatory. Other callers of extractFile keep strict parsing unless they explicitly enable the repair-review flow.
- Math and repair workers have timeouts and are terminated. Math input has a text fallback; verification failure never means an automatic wrong answer.
- Mathematical geometry and functions route through JSXGraph. Optics routes through upstream calculations and publication SVG. Other semantic diagrams retain the existing SVG renderer.
- Shading uses validated shapes and function references, SVG arcs, masks and patterns. Rational curve interpolation uses interval error bounds; polynomial curves up to degree three use exact cubic Bezier boundaries. Unsupported/undefined ranges are rejected.
- Regions and optics support question/hint/solution stages. Construction answers cannot appear in the question stage. Variant boundaries are recomputed from current references.

## Checks completed

- TypeScript and GitHub Pages production build.
- 15 JSON repair, math verification, input format and external Skill tests.
- 17 publication/schema/domain/optics tests.
- 8 existing import-quality tests, including the deterministic 100-run variant transport regression (not live Qwen calls).
- Real browser import preview and real StudyView screenshots were inspected for geometry, shading, function plots and optics. MathLive mounting was corrected using its public mount event. The user subsequently verified input and requested publication without further browser testing.

The full requested 12-category desktop/mobile screenshot matrix and Word/PDF application interoperability certification have not been completed. User accepted the drawing direction and cancelled Word export. Do not describe this build as full publication-software certification.

## External AI Skill

The copied in-product Skill is version 3.1. It includes validated full learning-pack examples, answer formats, shading structures, display-phase rules, units/domain limitations and JSON repair boundaries. The rules do not instruct external AI to fabricate verification results or alter confirmed rubrics.
