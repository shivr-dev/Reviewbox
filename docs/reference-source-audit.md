# Reviewbox 2.0 reference source audit

Checked 2026-10-31 using publisher GitHub trees, pinned README files, Hugging Face APIs, and bounded real-file reads. No complete large corpus or image archive was downloaded. Assessment of usable scope is an integration recommendation, not a legal determination.

## Summary and pins

| Source | Verified revision | Actual hosted material | Reuse assessment |
|---|---|---|---|
| zhenLiuu/k12-multidisciplinary GitHub | `32b2d4a965240a4b836b18c1d45f99fb6ec83434` | Documentation, schema, checksums, training/inference code; data hosted on HF | No LICENSE file in recursive tree; do not infer reuse permission from public access |
| zhenliuu/k12-multidisciplinary HF | `c99985f5280a411f3a89441ab9186c605d1fb39f` | raw Parquet + 9 image TAR shards; separate 1,160-row training JSONL/Parquet and 719-image TAR | Card has no license field or reuse grant. Mixed upstream datasets, physical-book OCR, generated/rewritten content; upstream item-level rights unspecified |
| chaosY/EduQS HF | `4221dc16bd9ca92a3bf6a3fc2741d0b9e664026a` | 12 JSONL files, **50 rows each = 600 hosted rows**, and **600 PNGs** | Card metadata declares Apache-2.0; preserve attribution/license and record revisions. No standalone LICENSE/NOTICE or item-level original-material provenance in sibling list/card |
| SmileWHC/CJEval | `590fb8f34239f642324b806b68374c303fe643bf` | 30 text data files with `.json` extension, under train/valid/test for 10 subjects | README explicitly restricts dataset to academic/research purposes and prohibits commercial use. No standalone LICENSE file |

Recommended public application scope: source catalog, verified format/count/license metadata and outbound links for every source; original authored practice examples. Make K12/CJEval content adapters opt-in for user-authorized local/research material rather than automatically bundling or republishing source questions. EduQS is the most practicable bounded optional import, subject to source attribution and item QA. Never label all three as freely reusable/open licensed question banks.

## K12 evidence and schema

- [Pinned GitHub tree API](https://api.github.com/repos/zhenLiuu/k12-multidisciplinary/git/trees/32b2d4a965240a4b836b18c1d45f99fb6ec83434?recursive=1)
- [Pinned HF README](https://huggingface.co/datasets/zhenliuu/k12-multidisciplinary/blob/c99985f5280a411f3a89441ab9186c605d1fb39f/README.md)
- [Pinned manifest](https://huggingface.co/datasets/zhenliuu/k12-multidisciplinary/blob/c99985f5280a411f3a89441ab9186c605d1fb39f/manifest.json)
- [Pinned raw record schema](https://huggingface.co/datasets/zhenliuu/k12-multidisciplinary/blob/c99985f5280a411f3a89441ab9186c605d1fb39f/record.schema.json)
- [Pinned training JSONL](https://huggingface.co/datasets/zhenliuu/k12-multidisciplinary/resolve/c99985f5280a411f3a89441ab9186c605d1fb39f/training/train.jsonl)

Published `default/raw`: 735,650 questions; 515,089 containing images; 416,099 unique images. Subject counts: math 62,966, physics 164,398, biology 199,084, geography 174,282, chemistry 134,920. Raw Parquet is 215,838,135 bytes (Zstandard); image index 28,022,009 bytes; nine TAR shards total roughly 9.2 GB. `manifest.json` identifies release `0.2.0`, status `release_candidate`, and provides per-file SHA-256s.

Raw fields: `id, source_id, source_file, split, question_type, subject, language, question, options, answer, explanation, images, table, sub_questions, metadata`. `options` is `{label,text}[]`, `answer` is `string[]`, images use `{path,caption,part_of}` objects. Paths are content-addressed relative names inside TAR members, **not directly resolvable individual HF image URLs**. Resolve image to shard with `images/index.parquet`, then read member; do not render missing diagrams as if a complete text-only question.

Training `dapo/train`: 1,160 questions (566 math, 594 physics), 712 with images and 719 unique images. JSONL 699,431 bytes; Parquet 229,871 bytes; `training/images.tar` 5,201,920 bytes. Seven fields: `id,subject,question_type,question,options,answer,images`. Does not supply explanation, grade, or difficulty. Actual first JSONL row parsed visibly as strings, `options` objects, answer `["D"]`, images `[]`; id `k12_fd7fdab71623db9fd1ddfba0fa68f7bcf79652aebd067e8c2a76a3228078c90b`. Its OCR question states a sum of squares equals zero while claiming two line-circle intersections, demonstrating a need to review mathematical consistency before publication.

## EduQS evidence and schema

- [Publisher metadata / exact sibling listing](https://huggingface.co/api/datasets/chaosY/EduQS)
- [Pinned README and Apache-2.0 declaration](https://huggingface.co/datasets/chaosY/EduQS/blob/4221dc16bd9ca92a3bf6a3fc2741d0b9e664026a/README.md)
- [Pinned real middle-school math JSONL](https://huggingface.co/datasets/chaosY/EduQS/resolve/4221dc16bd9ca92a3bf6a3fc2741d0b9e664026a/val/middle_math.jsonl)
- [Verified example PNG, HTTP 200 image/png](https://huggingface.co/datasets/chaosY/EduQS/resolve/4221dc16bd9ca92a3bf6a3fc2741d0b9e664026a/val/images/middle_math_6543.png)

Card describes a 52,056-question parent dataset but the named public repository currently serves **600 validation questions**, not 52,056 downloadable rows. Counted all 12 JSONL files in memory: high/middle × biology, chemistry, geography, history, math, physics; every file has 50 nonblank JSON lines. API lists 600 PNG paths. No train/test files in publisher sibling listing. Do not advertise 52,056 available imported questions.

Actual fields: `subject:string, id:string, type:string, grade:string, difficulty:string, question_info:string, image:string, options:string[], solution_info:string, answer:string, side_information:string[]`. README illustrative example describes image as an object, but **actual JSONL and metadata declare a string path**. Options have no explicit labels; map positions to A/B/C/D without changing stored source text. Prefix ids with dataset+file because id alone omits level.

Observed real row: file `middle_math.jsonl`, id `math_6543`, subject `math`, type `multiple-choice`, **grade `high` despite middle filename**, difficulty `easy`, image `val/images/middle_math_6543.png`, 4 option strings, answer `D`, side_information list. Keep original metadata and a separate normalized/QA status; do not silently trust grade or rewrite provenance. Some option math is absent from text, so display source image with the question.

Apache-2.0 declaration is a publisher claim covering the release; the card does not document rights clearance for underlying exam/book content. It also has no redistribution NOTICE file. Preserve source URLs, revision and declared-license text; avoid claiming original-material clearance was verified.

## CJEval evidence and schema

- [Pinned README / Ethics restrictions](https://github.com/SmileWHC/CJEval/blob/590fb8f34239f642324b806b68374c303fe643bf/README.md#ethics)
- [Pinned full tree API](https://api.github.com/repos/SmileWHC/CJEval/git/trees/590fb8f34239f642324b806b68374c303fe643bf?recursive=1)
- [Pinned real valid math data](https://raw.githubusercontent.com/SmileWHC/CJEval/590fb8f34239f642324b806b68374c303fe643bf/data/CJEval_data/valid/valid_%E5%88%9D%E4%B8%AD%E6%95%B0%E5%AD%A6.json)

Publisher-reported 26,136 questions: train 20,820, valid 2,106, test 3,210; 10 subjects (information technology, chemistry, history, geography, math, physics, biology, science, English, Chinese). Five types: SCQ 7,701, MRQ 2,569, TFQ 3,729, FBQ 6,193, AQ 5,944. Whole totals were not independently downloaded/recounted.

Despite `.json` extension, actual inspected `valid_初中数学.json` is **newline-delimited individual JSON objects**, not one JSON array. It has 200 nonblank records. Fields `subject,ques_type,ques_difficulty,ques_content,ques_answer,ques_analyze,ques_knowledges`; answer and knowledge fields are string arrays. No explicit id: derive stable id from source revision/file/line or content hash. Choices are embedded in `ques_content`, not separate options. Data files are text; recursive tree has no question images, only `src/overall_results.png` benchmark chart. Do not promise multimodal coverage from this source.

README explains questions were derived from real junior-high exams and rewritten. It specifies academic/research use only with commercial use prohibited. Rewriting does not establish an unrestricted license to the original material. Inspected math explanations also contain incorrect calculations; do not treat reference explanations as verified truth.

## Adapter requirements inferred from audit

Store `source_name, source_url, source_revision, source_file, source_record_id/line, declared_license, rights_status, imported_at, raw_record, image_refs, qa_status`. Normalize optional fields without inventing missing grade/difficulty/explanations. Use revision-pinned downloads, allowlist paths, enforce bounded row/image limits, preserve Unicode/LaTeX, render math and image-dependent content together, deduplicate only with provenance retained. Distinguish publisher total, actual hosted rows, and application imported count everywhere in UI.
