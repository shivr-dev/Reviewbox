// Frozen pre-refactor policy from Site source 8b60835c342034e6deca81104ac6e401932ca8d7. Offline evaluation only.
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};

// lib/model.ts
var SUBJECTS, keyOf, subjectName, localDay;
var init_model = __esm({
  "lib/model.ts"() {
    "use strict";
    SUBJECTS = [
      {
        id: "chinese",
        name: "\u8BED\u6587",
        en: "Chinese",
        glyph: "\u6587",
        course: "\u521D\u4E2D\u8BED\u6587",
        color: "#ac5a4c"
      },
      {
        id: "math",
        name: "\u6570\u5B66",
        en: "Mathematics",
        glyph: "\u{1D465}",
        course: "\u521D\u4E2D\u6570\u5B66",
        color: "#626bb0"
      },
      {
        id: "english",
        name: "\u82F1\u8BED",
        en: "English",
        glyph: "En",
        course: "Keyterms & Writing",
        color: "#8b789b"
      },
      {
        id: "ce",
        name: "\u4E2D\u6559\u82F1\u8BED CE",
        en: "Chinese English",
        glyph: "CE",
        course: "SAT / ACT \xB7 Grammar",
        color: "#5893a6"
      },
      {
        id: "physics",
        name: "\u7269\u7406",
        en: "Physics",
        glyph: "\u03C6",
        course: "\u5927\u9646\u521D\u4E2D\u7269\u7406",
        color: "#508686"
      },
      {
        id: "chemistry",
        name: "\u5316\u5B66",
        en: "Chemistry",
        glyph: "\u5316",
        course: "\u4E5D\u5E74\u7EA7\u5316\u5B66",
        color: "#5b987c"
      },
      {
        id: "biology",
        name: "\u751F\u7269",
        en: "Biology",
        glyph: "\u751F",
        course: "\u521D\u4E2D\u751F\u7269\u5B66",
        color: "#697c52"
      },
      {
        id: "history",
        name: "\u5386\u53F2",
        en: "History",
        glyph: "\u53F2",
        course: "\u5386\u53F2\u4E0E\u793E\u4F1A",
        color: "#aa8b57"
      }
    ];
    keyOf = (nodeId, skillId) => `${nodeId}::${skillId}`;
    subjectName = (id) => SUBJECTS.find((s) => s.id === id)?.name ?? id;
    localDay = (at = /* @__PURE__ */ new Date()) => new Intl.DateTimeFormat("en-CA", {
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(at);
  }
});

// lib/runtime.ts
var init_runtime = __esm({
  "lib/runtime.ts"() {
    "use strict";
  }
});

// lib/importer.ts
import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";
import { z } from "zod";
var subjects, safeText, skillSchema, nodeSchema, questionSchema;
var init_importer = __esm({
  "lib/importer.ts"() {
    "use strict";
    init_model();
    init_question_tools();
    init_runtime();
    subjects = SUBJECTS.map((x) => x.id);
    safeText = z.string().max(1e5);
    skillSchema = z.object({
      id: z.string().min(1).max(160),
      title: z.string().min(1).max(200),
      difficulty: z.number().int().min(1).max(5)
    });
    nodeSchema = z.object({
      id: z.string().min(1).max(160),
      subject: z.enum([
        "chinese",
        "math",
        "english",
        "ce",
        "physics",
        "chemistry",
        "history",
        "biology"
      ]),
      course: safeText,
      unit: safeText,
      chapter: safeText,
      title: z.string().min(1).max(300),
      description: safeText,
      prerequisites: z.array(z.string()).max(50).default([]),
      relatedNodes: z.array(z.string()).max(50).default([]),
      importance: z.number().min(0).max(1),
      examWeight: z.number().min(0).max(1),
      skills: z.array(skillSchema).min(1).max(30),
      source: safeText,
      version: z.string().max(50),
      tags: z.array(z.string()).optional()
    });
    questionSchema = z.object({
      cognitiveAttributes: z.array(
        z.enum([
          "symbolic",
          "calculation",
          "evidence",
          "vocabulary",
          "syntax",
          "recall",
          "causal",
          "application"
        ])
      ).max(8).optional(),
      conceptIds: z.array(z.string().min(1).max(100)).max(8).optional(),
      contextId: z.string().min(1).max(160).optional(),
      memoryFamily: z.enum(["formula", "vocabulary", "fact", "reasoning"]).optional(),
      examTask: z.any().optional(),
      schemaVersion: z.literal(1),
      id: z.string().min(1).max(160),
      nodeId: z.string().min(1).max(160),
      skillId: z.string().min(1).max(160),
      subject: z.enum([
        "chinese",
        "math",
        "english",
        "ce",
        "physics",
        "chemistry",
        "history",
        "biology"
      ]),
      type: z.string().max(60),
      prompt: z.string().min(1).max(12e3),
      answer: z.string().min(1).max(12e3),
      explanation: safeText,
      difficulty: z.number().int().min(1).max(5),
      expectedSeconds: z.number().min(1).max(3600),
      variant: z.string().max(200),
      options: z.array(z.string().max(3e3)).max(6).optional(),
      acceptedAnswers: z.array(z.string().max(3e3)).max(20).optional(),
      matching: z.object({
        left: z.array(z.object({ id: z.string().max(30), text: z.string().max(1e3) })).min(2).max(8),
        right: z.array(z.object({ id: z.string().max(30), text: z.string().max(1e3) })).min(2).max(8)
      }).optional(),
      transferFrom: z.string().max(160).optional(),
      collectionId: z.string().max(160).optional(),
      collectionTitle: z.string().max(200).optional(),
      passage: z.string().max(3e4).optional(),
      rubric: z.array(
        z.object({
          id: z.string(),
          title: z.string(),
          max: z.number().positive().max(100),
          description: z.string().max(3e3),
          skillId: z.string()
        })
      ).max(20).optional(),
      solution: z.array(z.string().max(4e3)).max(12).optional(),
      diagram: z.any().optional(),
      source: safeText,
      tags: z.array(z.string()).max(30),
      version: z.string().max(50),
      verified: z.boolean().optional(),
      verification: z.any().optional(),
      expiresAt: z.string().optional()
    });
  }
});

// lib/det-model.ts
function detDefinitions() {
  const reading = ["det_reading_sentences", "det_reading_passage", "det_reading_highlight", "det_reading_highlight", "det_reading_idea", "det_reading_title"];
  const listening = ["det_listening_complete", ...Array(5).fill("det_listening_respond"), "det_listening_summary"];
  return [
    { title: "Read and Select", types: Array(15).fill("det_read_select") },
    { title: "Fill in the Blanks / Read and Complete", types: [...Array(6).fill("det_fill_blanks"), ...Array(3).fill("det_read_complete")] },
    { title: "Listen and Type", types: Array(6).fill("det_listen_type") },
    { title: "Interactive Reading", types: [...reading, ...reading] },
    { title: "Interactive Listening", types: [...listening, ...listening] },
    { title: "Writing", types: [...Array(3).fill("det_write_photo"), "det_writing", "det_writing_followup"] },
    { title: "Speaking", types: ["det_speak_photo", "det_read_speak", ...Array(6).fill("det_conversation")] },
    { title: "Samples", types: ["det_writing_sample", "det_speaking_sample"] }
  ];
}
var DET_TASKS;
var init_det_model = __esm({
  "lib/det-model.ts"() {
    "use strict";
    init_importer();
    init_exam_model();
    DET_TASKS = {
      det_read_select: { route: "read-select", seconds: 5, type: "choice" },
      det_fill_blanks: { route: "fill-blanks", seconds: 20, type: "blank" },
      det_read_complete: { route: "read-complete", seconds: 180, type: "blank" },
      det_listen_type: { route: "listen-type", seconds: 60, type: "blank" },
      det_reading_sentences: { route: "reading-sentences", seconds: 480, type: "blank" },
      det_reading_passage: { route: "reading-passage", seconds: 480, type: "choice" },
      det_reading_highlight: { route: "reading-highlight-1", seconds: 480, type: "blank" },
      det_reading_idea: { route: "reading-idea", seconds: 480, type: "choice" },
      det_reading_title: { route: "reading-title", seconds: 480, type: "choice" },
      det_listening_complete: { route: "listening-complete", seconds: 390, type: "blank" },
      det_listening_respond: { route: "listening-respond", seconds: 390, type: "choice" },
      det_listening_summary: { route: "listening-summary", seconds: 75, type: "subjective" },
      det_write_photo: { route: "write-photo", seconds: 60, type: "subjective" },
      det_writing: { route: "writing", seconds: 300, type: "subjective" },
      det_writing_followup: { route: "writing-followup", seconds: 180, type: "subjective" },
      det_speak_photo: { route: "speak-photo", seconds: 90, type: "subjective" },
      det_read_speak: { route: "read-speak", seconds: 90, type: "subjective" },
      det_conversation: { route: "conversation", seconds: 35, type: "subjective" },
      det_writing_sample: { route: "writing-sample", seconds: 300, type: "subjective" },
      det_speaking_sample: { route: "speaking-sample", seconds: 180, type: "subjective" }
    };
  }
});

// lib/exam-model.ts
function examStages(exam, options) {
  if (options.stages) return options.stages;
  if (exam === "DET")
    return detDefinitions().map((d, stage) => ({
      id: "det" + stage,
      title: d.title,
      section: d.title,
      count: d.types.length,
      seconds: d.types.reduce((n, t) => n + DET_TASKS[t].seconds, 0),
      breakAfter: 0,
      adaptive: false,
      slots: d.types.map((type, index) => ({
        id: stage + "-standard-" + index,
        stage,
        index,
        domain: type,
        type: DET_TASKS[type].type,
        route: "standard",
        group: stage === 3 ? "det-reading-" + Math.floor(index / 6) : stage === 4 ? "det-listening-" + Math.floor(index / 7) : void 0
      }))
    }));
  if (exam === "MAP") {
    const section = options.mapSection ?? "Reading";
    const count = options.count ?? 43;
    const domains = section === "Reading" ? ["Literary Text", "Informational Text", "Vocabulary"] : ["Writing: Purpose and Audience", "Grammar and Usage", "Mechanics"];
    return [
      {
        id: "map",
        title: section,
        section,
        count,
        seconds: 0,
        breakAfter: 0,
        adaptive: false,
        slots: Array.from({ length: options.poolSize ?? 65 }, (_, index) => ({
          id: "0-standard-" + index,
          stage: 0,
          index,
          domain: domains[index % 3],
          type: "blank",
          route: "standard"
        }))
      }
    ];
  }
  const definitions = exam === "SAT" ? [
    ["Reading and Writing \xB7 Module 1", 27, 32, 0, false],
    ["Reading and Writing \xB7 Module 2", 27, 32, 0, true]
  ] : exam === "TOEFL" ? [
    ["Reading", 50, 30, 0, false],
    ["Listening", 47, 29, 0, false],
    ["Writing", 12, 23, 0, false],
    ["Speaking", 11, 8, 0, false]
  ] : [
    ["English", 50, 35, 0, false],
    ["Reading", 36, 40, options.writing ? 5 : 0, false],
    ...options.writing ? [
      ["Writing", 1, 40, 0, false]
    ] : []
  ];
  return definitions.map(([title, count, minutes, rest, adaptive], stage) => {
    const section = title.split(" \xB7 ")[0], slots = [];
    for (const route of adaptive ? ["lower", "higher"] : ["standard"])
      for (let index = 0; index < count; index++) {
        let domain = section, group;
        if (exam === "SAT")
          domain = index < 8 ? rw[0] : index < 15 ? rw[1] : index < 22 ? rw[2] : rw[3];
        else if (section === "English") {
          const g = index < 40 ? Math.floor(index / 10) : 4 + Math.floor((index - 40) / 5);
          group = "english-" + g;
          domain = index % 5 < 3 ? "Conventions of Standard English" : index % 5 === 3 ? "Production of Writing" : "Knowledge of Language";
        } else if (section === "Reading") {
          group = "reading-" + Math.floor(index / 9);
          domain = index % 9 < 4 ? "Key Ideas and Details" : index % 9 < 7 ? "Craft and Structure" : "Integration of Knowledge and Ideas";
        }
        slots.push({
          id: stage + "-" + route + "-" + index,
          stage,
          index,
          domain,
          type: section === "Writing" ? "subjective" : "choice",
          group,
          route
        });
      }
    return {
      id: String(stage),
      title,
      section,
      count,
      seconds: minutes * 60,
      breakAfter: rest * 60,
      adaptive,
      slots
    };
  });
}
var EXAM_FORMAT, rw, allSlots, paperReady;
var init_exam_model = __esm({
  "lib/exam-model.ts"() {
    "use strict";
    init_det_model();
    init_question_tools();
    EXAM_FORMAT = "english-v1";
    rw = [
      "Craft and Structure",
      "Information and Ideas",
      "Standard English Conventions",
      "Expression of Ideas"
    ];
    allSlots = (paper) => examStages(paper.exam, paper.options).flatMap((s) => s.slots);
    paperReady = (p, questions) => p.format === EXAM_FORMAT && allSlots(p).length > 0 && allSlots(p).every(
      (s) => typeof p.questions[s.id] === "string" && (!questions || questions.some(
        (q) => q.id === p.questions[s.id] && q.reviewStatus !== "paused" && (q.verified || p.origin === "imported")
      ))
    );
  }
});

// lib/map-model.ts
import { z as z2 } from "zod";
var text, choicePart, mapItemSchema;
var init_map_model = __esm({
  "lib/map-model.ts"() {
    "use strict";
    init_exam_model();
    init_importer();
    text = z2.string().trim().min(1).max(12e3);
    choicePart = z2.object({
      prompt: text,
      choices: z2.array(text).min(2).max(6),
      answer: text
    });
    mapItemSchema = z2.object({
      type: z2.enum([
        "mcq",
        "multi_select",
        "gap_match",
        "text_entry",
        "hot_text",
        "two_part"
      ]),
      prompt: text,
      passage: z2.string().max(3e4).optional(),
      passageTitle: z2.string().max(300).optional(),
      instruction: z2.string().max(1e3).optional(),
      choices: z2.array(text).min(2).max(6).optional(),
      answer: z2.union([text, z2.array(text).min(1).max(12)]),
      explanation: text,
      skill: z2.string().min(1).max(80),
      difficulty: z2.number().int().min(1).max(5).default(3),
      selectCount: z2.number().int().min(1).max(6).optional(),
      parts: z2.array(choicePart).length(2).optional(),
      tokens: z2.array(text).min(2).max(12).optional(),
      correction: text.optional(),
      acceptedAnswers: z2.array(text).max(20).optional(),
      image: z2.string().max(15e5).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/).optional(),
      imageAlt: z2.string().max(1e3).optional(),
      layout: z2.literal("word-table").optional(),
      word: z2.string().max(300).optional()
    });
  }
});

// lib/question-tools.ts
var isPinyin;
var init_question_tools = __esm({
  "lib/question-tools.ts"() {
    "use strict";
    init_map_model();
    isPinyin = (q) => q.type === "pinyin" || q.variant === "pinyin-to-hanzi" || /根据拼音|看拼音/.test(q.prompt);
  }
});

// lib/engine.ts
init_model();

// lib/learning-intelligence.ts
init_model();
init_question_tools();
var DAY = 864e5;
var clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
var mean = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
var ATTRIBUTE_NAMES = {
  symbolic: "\u7B26\u53F7\u4E0E\u9010\u6B65\u63A8\u5BFC",
  calculation: "\u6570\u503C\u8FD0\u7B97",
  evidence: "\u4FE1\u606F\u63D0\u53D6\u4E0E\u8BC1\u636E\u5224\u65AD",
  vocabulary: "\u8BCD\u4E49\u8FA8\u6790",
  syntax: "\u8BED\u6CD5\u4E0E\u7ED3\u6784",
  recall: "\u51C6\u786E\u56DE\u5FC6",
  causal: "\u56E0\u679C\u4E0E\u673A\u5236\u63A8\u7406",
  application: "\u60C5\u5883\u5EFA\u6A21\u4E0E\u5E94\u7528"
};
var FAMILY_NAMES = {
  formula: "\u516C\u5F0F\u4E0E\u8FD0\u7B97",
  vocabulary: "\u5B57\u8BCD\u4E0E\u672F\u8BED",
  fact: "\u4E8B\u5B9E\u4E0E\u8BB0\u5FC6",
  reasoning: "\u7406\u89E3\u4E0E\u63A8\u7406"
};
var POLICIES = [
  { id: "cautious", title: "\u8F83\u65E9\u9A8C\u8BC1", factor: 0.8 },
  { id: "balanced", title: "\u5747\u8861\u95F4\u9694", factor: 1 },
  { id: "expansive", title: "\u5EF6\u957F\u95F4\u9694", factor: 1.2 }
];
function cleanEvents(events, now = Date.now()) {
  const seen = /* @__PURE__ */ new Set();
  return [...events].sort(
    (a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id)
  ).filter((e) => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    const at = Date.parse(e.occurredAt);
    return !e.voidedBy && Number.isFinite(at) && at <= now && Number.isFinite(e.score) && e.score >= 0 && e.score <= 1;
  });
}
var taskText = (q, n) => [
  n?.title,
  n?.skills.find((s) => s.id === q.skillId)?.title,
  ...q.tags ?? []
].join(" ");
function attributesFor(q, n) {
  const explicit = q.cognitiveAttributes?.filter((id) => id in ATTRIBUTE_NAMES);
  if (explicit?.length) return [...new Set(explicit)];
  const t = taskText(q, n), result = [];
  if (/推导|证明|代数|方程|符号|symbol|equation/i.test(t))
    result.push("symbolic");
  if (/计算|运算|求|顶点|最值|calculation/i.test(t)) result.push("calculation");
  if (/阅读|材料|证据|分析|identification|evidence|analysis|reading/i.test(t))
    result.push("evidence");
  if (isPinyin(q) || /字词|词义|术语|keyterm|vocabulary|definition/i.test(t))
    result.push("vocabulary");
  if (/语法|标点|时态|grammar|agreement|punctuation|sentence|modifier/i.test(t))
    result.push("syntax");
  if (/记忆|背诵|日期|化学式|recall/i.test(t) || ["recall", "pinyin"].includes(q.type))
    result.push("recall");
  if (/原因|机制|现象|因果|影响|cause|effect|phenomenon/i.test(t))
    result.push("causal");
  if (/应用|建模|实验|application|experiment/i.test(t))
    result.push("application");
  return [...new Set(result)].slice(0, 4);
}
function memoryFamily(q, n) {
  if (q.memoryFamily) return q.memoryFamily;
  const t = taskText(q, n);
  if (isPinyin(q) || /字词|单词|术语|vocabulary|keyterm|definition/i.test(t))
    return "vocabulary";
  if (/公式|计算|运算|方程|化学式|化合价|formula|equation/i.test(t))
    return "formula";
  return ["recall", "pinyin"].includes(q.type) || /背诵|史实|日期|作者|朝代/.test(t) ? "fact" : "reasoning";
}
function objective(q) {
  return !isPinyin(q) && ["choice", "blank", "matching"].includes(q.type);
}
function reusable(q, now = Date.now()) {
  return q.reviewStatus !== "paused" && !q.tags?.some(
    (t) => ["exam-only", "course-check", "course-content"].includes(t)
  ) && (!q.expiresAt || Date.parse(q.expiresAt) > now);
}
function evidenceReliability(e) {
  const objective2 = e.learningEvidence?.assessment === "objective" || e.source === "test" && !!e.answer;
  let weight = objective2 || e.source === "rubric" ? 1 : 0.45;
  if (e.usedHint) weight *= 0.4;
  if (e.learningEvidence?.suspect) weight *= 0.3;
  if (!Number.isFinite(e.activeThinkMs) || e.activeThinkMs < Math.max(1500, Math.min(5e3, e.expectedSeconds * 200)))
    weight *= 0.25;
  if (e.predictedConfidence === "guess") weight *= 0.5;
  return weight;
}
function cognitiveDiagnosis(data, subject, now = Date.now()) {
  const qs = new Map(data.questions.map((q) => [q.id, q])), ns = new Map(data.nodes.map((n) => [n.id, n]));
  const events = cleanEvents(data.events, now).filter(
    (e) => (!subject || e.subject === subject) && now - Date.parse(e.occurredAt) < 90 * DAY
  );
  const result = [];
  for (const subj of [...new Set(events.map((e) => e.subject))]) {
    const seenTasks = /* @__PURE__ */ new Set();
    const rows = events.filter((e) => e.subject === subj && !e.learningEvidence?.pressure).map((e) => {
      const q = qs.get(e.questionId);
      const mapped = e.learningEvidence?.cognitiveAttributes ?? (q ? attributesFor(q, ns.get(q.nodeId)) : []);
      return {
        e,
        q,
        attrs: Array.isArray(mapped) ? mapped.filter((id) => id in ATTRIBUTE_NAMES) : []
      };
    }).filter((r) => r.attrs.length && r.q).filter((r) => {
      const key = r.e.questionId + "|" + r.e.localDay;
      if (seenTasks.has(key)) return false;
      seenTasks.add(key);
      return true;
    }).slice(-120);
    const attrs = [...new Set(rows.flatMap((r) => r.attrs))].slice(0, 8);
    if (!attrs.length) continue;
    const logs = Array.from(
      { length: 1 << attrs.length },
      (_, mask) => rows.reduce((sum, r) => {
        const mastered = r.attrs.every(
          (a) => (mask & 1 << attrs.indexOf(a)) !== 0
        );
        const guess = r.q?.options?.length ? 1 / r.q.options.length : 0.12;
        const p = mastered ? 0.9 : clamp(guess, 0.12, 0.5);
        const decay = Math.exp(-(now - Date.parse(r.e.occurredAt)) / DAY / 45);
        return sum + evidenceReliability(r.e) * decay * (r.e.score * Math.log(p) + (1 - r.e.score) * Math.log(1 - p));
      }, 0)
    );
    const peak = Math.max(...logs), weights = logs.map((v) => Math.exp(v - peak)), total = weights.reduce((a, b) => a + b, 0);
    const deficits = attrs.map(
      (_, i) => weights.reduce((s, w, mask) => s + (mask & 1 << i ? 0 : w), 0) / total
    );
    const errors = rows.filter((r) => r.e.score < 0.65);
    for (const [i, attribute] of attrs.entries()) {
      const relevant = rows.filter((r) => r.attrs.includes(attribute));
      const signatures = new Set(
        relevant.map((r) => r.attrs.slice().sort().join("|"))
      );
      const confounded = attrs.some(
        (other) => other !== attribute && rows.every(
          (r) => r.attrs.includes(attribute) === r.attrs.includes(other)
        )
      );
      const tasks = new Set(
        relevant.map((r) => r.q.variant + "|" + r.e.questionId)
      ).size;
      const days = new Set(relevant.map((r) => r.e.localDay)).size;
      const mass = errors.reduce((sum, r) => {
        if (!r.attrs.includes(attribute)) return sum;
        const denominator = r.attrs.reduce(
          (s, a) => s + deficits[attrs.indexOf(a)],
          0
        );
        return sum + (1 - r.e.score) * deficits[i] / Math.max(1e-3, denominator);
      }, 0);
      const totalError = errors.reduce((s, r) => s + 1 - r.e.score, 0);
      result.push({
        subject: subj,
        attribute,
        title: ATTRIBUTE_NAMES[attribute],
        deficit: deficits[i],
        errorShare: totalError ? mass / totalError : 0,
        observations: relevant.length,
        distinctTasks: tasks,
        days,
        identifiable: !confounded && signatures.size > 0 && relevant.length >= 6 && tasks >= 3 && days >= 2,
        evidenceIds: relevant.filter((r) => r.e.score < 0.65).slice(-4).map((r) => r.e.id)
      });
    }
  }
  return result.sort(
    (a, b) => Number(b.identifiable) - Number(a.identifiable) || b.errorShare - a.errorShare
  );
}
function verificationCandidate(data, event, excluded = [], now = Date.now()) {
  const source = data.questions.find((q) => q.id === event.questionId);
  if (!source || !event.learningEvidence?.suspect || event.learningEvidence.verificationOf)
    return void 0;
  if (data.events.some((e) => e.learningEvidence?.verificationOf === event.id))
    return void 0;
  return data.questions.filter(
    (q) => q.id !== source.id && q.prompt !== source.prompt && q.variant !== source.variant && q.nodeId === source.nodeId && q.skillId === source.skillId && q.verified && objective(q) && reusable(q, now) && Math.abs(q.difficulty - source.difficulty) <= 1 && !excluded.includes(q.id) && !data.events.some(
      (e) => e.questionId === q.id && now - Date.parse(e.occurredAt) < DAY
    )
  ).sort(
    (a, b) => Math.abs(a.difficulty - source.difficulty) - Math.abs(b.difficulty - source.difficulty)
  )[0];
}
function delayedTrials(data, now) {
  const qs = new Map(data.questions.map((q) => [q.id, q])), ns = new Map(data.nodes.map((n) => [n.id, n]));
  const previous = /* @__PURE__ */ new Map(), trials = [];
  for (const e of cleanEvents(data.events, now)) {
    if (e.usedHint || e.learningEvidence?.pressure || e.learningEvidence?.suspect)
      continue;
    const k = keyOf(e.nodeId, e.skillId), old = previous.get(k), q = qs.get(e.questionId);
    if (old && (q || e.learningEvidence?.memoryFamily) && old.score >= 0.85 && !old.learningEvidence?.suspect) {
      const gap = (Date.parse(e.occurredAt) - Date.parse(old.occurredAt)) / DAY;
      if (gap >= 0.5 && gap <= 180 && Math.abs(old.difficulty - e.difficulty) <= 1)
        trials.push({
          e,
          previous: old,
          gap,
          family: e.learningEvidence?.memoryFamily ?? memoryFamily(q, ns.get(q.nodeId))
        });
    }
    previous.set(k, e);
  }
  return trials;
}
function memoryFingerprint(data, now = Date.now()) {
  const trials = delayedTrials(data, now);
  return Object.keys(FAMILY_NAMES).map((family) => {
    const rows = trials.filter((t) => t.family === family), days = new Set(rows.map((t) => t.e.localDay)).size;
    const bins = [1, 3, 7, 14, 30].map((upper, i, all) => {
      const selected = rows.filter(
        (t) => t.gap <= upper && (i === 0 || t.gap > all[i - 1])
      );
      const weight = selected.reduce((s, t) => s + evidenceReliability(t.e), 0);
      const success2 = selected.reduce(
        (s, t) => s + t.e.score * evidenceReliability(t.e),
        0
      );
      return {
        days: upper,
        count: selected.length,
        retention: (success2 + 2) / (weight + 3)
      };
    });
    const success = rows.reduce(
      (s, t) => s + t.e.score * evidenceReliability(t.e),
      0
    );
    const exposure = rows.reduce(
      (s, t) => s + t.gap * evidenceReliability(t.e),
      0
    );
    const failures = rows.reduce(
      (s, t) => s + (1 - t.e.score) * evidenceReliability(t.e),
      0
    );
    const horizon = clamp((exposure + 14) / (failures + 2), 1, 90);
    const ready = rows.length >= 6 && days >= 3 && bins.filter((b) => b.count).length >= 2;
    return {
      family,
      title: FAMILY_NAMES[family],
      trials: rows.length,
      days,
      ready,
      horizon,
      bins,
      retention: mean(rows.map((t) => t.e.score)),
      success,
      factor: ready ? clamp(Math.sqrt(horizon / 7), 0.65, 1.35) : 1,
      curve: [0, 1, 3, 7, 14, 30].map((days2) => ({
        days: days2,
        retention: Math.exp(-days2 / horizon)
      })),
      shape: !ready ? "\u79EF\u7D2F\u95F4\u9694\u8BC1\u636E" : horizon < 5 ? "\u8F83\u5FEB\u4E0B\u964D" : horizon < 14 ? "\u9010\u6B65\u4E0B\u964D" : "\u4FDD\u6301\u8F83\u4E45"
    };
  });
}
function policyEvolution(data, now = Date.now()) {
  const trials = delayedTrials(data, now).filter(
    (t) => t.previous.learningEvidence?.policy
  );
  const arms = POLICIES.map((p) => {
    const rows = trials.filter(
      (t) => t.previous.learningEvidence?.policy === p.id
    );
    const count = rows.length, skills = new Set(rows.map((t) => keyOf(t.e.nodeId, t.e.skillId))).size;
    const score = count ? mean(rows.map((t) => t.e.score)) : 0;
    const uncertainty = count ? Math.sqrt(Math.log(60) / (2 * count)) : 1;
    return {
      ...p,
      count,
      skills,
      score,
      lower: Math.max(0, score - uncertainty),
      upper: Math.min(1, score + uncertainty),
      ready: count >= 20 && skills >= 4
    };
  });
  const ranked = [...arms].sort((a, b) => b.lower - a.lower);
  const winner = arms.every((a) => a.ready) && ranked[0].lower > Math.max(...ranked.slice(1).map((a) => a.upper)) + 0.03 ? ranked[0].id : void 0;
  return {
    arms,
    winner,
    trials: trials.length,
    status: winner ? "\u91C7\u7528\u8BC1\u636E\u8F83\u5F3A\u7684\u7B56\u7565" : "\u4FDD\u5B88\u6BD4\u8F83\u4E2D"
  };
}
function flowDifficulty(data, nodeId, skillId, mastery = 0.35, now = Date.now(), orderedEvents) {
  const history = (orderedEvents ?? cleanEvents(data.events, now)).filter(
    (e) => e.nodeId === nodeId && e.skillId === skillId && !e.usedHint && !e.learningEvidence?.pressure && !e.learningEvidence?.suspect
  ).slice(-30);
  const ability = clamp(mastery + 0.15, 0.1, 0.95);
  const priorLogit = Math.log(ability / (1 - ability));
  let adjustment = 0;
  for (let step = 0; step < 6; step++) {
    let gradient = -2 * adjustment, curvature = 2;
    for (const e of history) {
      const weight = evidenceReliability(e), p = 1 / (1 + Math.exp(-(priorLogit + adjustment + (3 - e.difficulty) * 0.75)));
      gradient += weight * (e.score - p);
      curvature += weight * p * (1 - p);
    }
    adjustment = clamp(adjustment + gradient / curvature, -2, 2);
  }
  const levels = [1, 2, 3, 4, 5].map((difficulty) => {
    const prior = 1 / (1 + Math.exp(-(priorLogit + adjustment + (3 - difficulty) * 0.75)));
    const same = history.filter((e) => e.difficulty === difficulty), weight = same.reduce((s, e) => s + evidenceReliability(e), 0);
    const observed = same.reduce(
      (s, e) => s + e.score * evidenceReliability(e),
      0
    );
    return {
      difficulty,
      probability: (prior * 5 + observed) / (5 + weight),
      samples: same.length
    };
  });
  for (let i = 1; i < levels.length; i++)
    levels[i].probability = Math.min(
      levels[i].probability,
      levels[i - 1].probability
    );
  const selected = [...levels].sort(
    (a, b) => Math.abs(a.probability - 0.75) - Math.abs(b.probability - 0.75)
  )[0];
  return { ...selected, target: 0.75, samples: history.length, levels };
}
var CONCEPT_PATTERNS = [
  ["vector", /向量|力的合成|力的分解|vector/i],
  ["proportion", /比例|比率|密度|浓度|速率|proportion|ratio/i],
  ["conservation", /守恒|平衡|equilibrium|conservation/i],
  ["causality", /因果|原因|cause and effect|causality/i],
  ["evidence", /证据|材料分析|source analysis|textual evidence/i],
  ["structure-function", /结构与功能|structure and function/i]
];
function conceptsFor(q, n) {
  if (q.conceptIds?.length) return [...new Set(q.conceptIds)];
  const text2 = taskText(q, n);
  return CONCEPT_PATTERNS.filter(([, pattern]) => pattern.test(text2)).map(
    ([id]) => id
  );
}
function transferCandidates(data, subject, now = Date.now()) {
  const events = cleanEvents(data.events, now), ns = new Map(data.nodes.map((n) => [n.id, n]));
  const sources = data.questions.filter(
    (q) => events.some(
      (e) => e.questionId === q.id && e.score >= 0.85 && !e.usedHint && !e.learningEvidence?.suspect && now - Date.parse(e.occurredAt) >= DAY
    )
  );
  const pairs = [];
  for (const target of data.questions) {
    if (subject && target.subject !== subject || !target.verified || !reusable(target, now) || events.some(
      (e) => e.questionId === target.id && now - Date.parse(e.occurredAt) < 7 * DAY
    ))
      continue;
    const concepts = conceptsFor(target, ns.get(target.nodeId));
    const source = sources.find(
      (s) => s.id !== target.id && s.prompt !== target.prompt && s.variant !== target.variant && Math.abs(s.difficulty - target.difficulty) <= 1 && (s.subject !== target.subject || s.contextId && target.contextId && s.contextId !== target.contextId) && conceptsFor(s, ns.get(s.nodeId)).some((id) => concepts.includes(id))
    );
    if (source)
      pairs.push({
        source,
        target,
        concept: concepts.find(
          (id) => conceptsFor(source, ns.get(source.nodeId)).includes(id)
        ),
        crossSubject: source.subject !== target.subject
      });
  }
  return pairs.sort((a, b) => Number(b.crossSubject) - Number(a.crossSubject));
}
function pressureQuestions(data, states, subject, scope = [], now = Date.now()) {
  const events = cleanEvents(data.events, now), perSkill = /* @__PURE__ */ new Map();
  return data.questions.filter(
    (q) => objective(q) && reusable(q, now) && (!subject || q.subject === subject) && (!scope.length || scope.includes(q.nodeId))
  ).sort((a, b) => {
    const rank = (q) => {
      const baseline = events.filter(
        (e) => e.nodeId === q.nodeId && e.skillId === q.skillId && e.questionId !== q.id && Math.abs(e.difficulty - q.difficulty) <= 1 && !e.usedHint && !e.learningEvidence?.pressure && evidenceReliability(e) >= 0.8
      );
      return (baseline.length >= 2 ? -1 : 0) + (states[keyOf(q.nodeId, q.skillId)]?.mastery ?? 0.35) + (events.some(
        (e) => e.questionId === q.id && now - Date.parse(e.occurredAt) < DAY
      ) ? 5 : 0);
    };
    return rank(a) - rank(b);
  }).filter((q) => {
    const k = keyOf(q.nodeId, q.skillId), count = perSkill.get(k) ?? 0;
    perSkill.set(k, count + 1);
    return count < 2;
  }).slice(0, 10);
}

// lib/question-quality.ts
var questionAvailable = (q) => q.reviewStatus !== "paused";

// lib/remediation.ts
var DAY2 = 864e5;
function buildRemediation(data, sessionId, title, now = Date.now()) {
  const groups = /* @__PURE__ */ new Map();
  for (const e of data.events.filter(
    (e2) => e2.sessionId === sessionId && !e2.voidedBy && e2.score < 0.85
  )) {
    const q = data.questions.find(
      (q2) => q2.id === e.questionId && questionAvailable(q2)
    );
    if (!q) continue;
    const targets = e.targets?.filter((t) => t.score < 0.85) ?? [
      { skillId: e.skillId, score: e.score }
    ];
    for (const t of targets) {
      const id = e.nodeId + "::" + t.skillId, n = data.nodes.find((n2) => n2.id === e.nodeId);
      if (!n?.skills.some((s) => s.id === t.skillId)) continue;
      const group = groups.get(id) ?? {
        id,
        nodeId: e.nodeId,
        skillId: t.skillId,
        title: n.title + " \xB7 " + n.skills.find((s) => s.id === t.skillId).title,
        sources: [],
        stage: 0
      };
      if (!group.sources.some((s) => s.eventId === e.id))
        group.sources.push({
          question: q,
          eventId: e.id,
          answer: e.answer ?? "\u624B\u52A8\u68C0\u67E5\uFF1A" + e.outcome,
          score: t.score
        });
      groups.set(id, group);
    }
  }
  const gs = [...groups.values()].sort(
    (a, b) => a.sources.reduce((s, q) => s + q.score, 0) / a.sources.length - b.sources.reduce((s, q) => s + q.score, 0) / b.sources.length
  );
  return {
    id: "remediation:" + sessionId,
    kind: "remediation",
    sessionId,
    title: title + " \xB7 \u8865\u6551\u8BFE\u7A0B",
    createdAt: new Date(now).toISOString(),
    subject: gs[0]?.sources[0]?.question.subject ?? "all",
    groups: gs
  };
}
function remedyProgress(job, g, events, now = Date.now()) {
  const linked = events.filter(
    (e) => !e.voidedBy && e.learningEvidence?.remediationId === job.id && e.learningEvidence.remediationGroup === g.id
  ).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const practices = linked.filter(
    (e) => e.learningEvidence?.remediationPhase === "practice" && Date.parse(e.occurredAt) >= Date.parse(g.lessonCompletedAt ?? job.createdAt)
  );
  const last = practices.at(-1), due = last ? Date.parse(last.occurredAt) + DAY2 : null;
  const sourceIds = new Set(g.sources.map((s) => s.question.id)), sourceVariants = new Set(g.sources.map((s) => s.question.variant));
  const checks = linked.filter(
    (e) => e.learningEvidence?.remediationPhase === "verify" && due !== null && Date.parse(e.occurredAt) >= due && !sourceIds.has(e.questionId) && !sourceVariants.has(e.variant) && !practices.some(
      (p) => p.questionId === e.questionId || p.variant === e.variant
    )
  );
  const successful = checks.find(
    (e) => e.score >= 0.85 && !e.usedHint && !e.learningEvidence?.suspect && e.predictedConfidence !== "guess" && (e.activeThinkMs ?? Date.parse(e.revealedAt) - Date.parse(e.displayedAt)) >= Math.max(1500, e.expectedSeconds * 100)
  );
  return {
    practices,
    due,
    ready: due !== null && now >= due,
    successful,
    failed: !successful && checks.length > 0
  };
}
function remedyPractice(data, job, g, phase, now = Date.now()) {
  if (!g.sources.some(
    (s) => data.events.some((e) => e.id === s.eventId && !e.voidedBy) && data.questions.some(
      (q) => q.id === s.question.id && questionAvailable(q)
    )
  ))
    return [];
  const p = remedyProgress(job, g, data.events, now);
  if (phase === "verify" && (!p.ready || p.successful)) return [];
  const sources = new Set(g.sources.map((s) => s.question.id)), variants = new Set(g.sources.map((s) => s.question.variant));
  const candidates = data.questions.filter(
    (q) => questionAvailable(q) && q.nodeId === g.nodeId && q.skillId === g.skillId && !q.tags.includes("course-check") && (!q.expiresAt || Date.parse(q.expiresAt) > now)
  );
  const newQuestions = candidates.filter(
    (q) => !sources.has(q.id) && !variants.has(q.variant) && !p.practices.some(
      (e) => e.questionId === q.id || e.variant === q.variant || data.questions.find((x) => x.id === e.questionId)?.prompt.trim() === q.prompt.trim()
    ) && !data.events.some((e) => !e.voidedBy && e.questionId === q.id) && !g.sources.some((s) => s.question.prompt.trim() === q.prompt.trim())
  );
  const selected = (phase === "verify" ? newQuestions.filter((q) => q.verified) : newQuestions.length ? newQuestions : candidates.filter((q) => sources.has(q.id))).slice(0, phase === "verify" ? 1 : 3);
  return selected.map((q) => ({
    question: q,
    reason: phase === "verify" ? "\u8865\u6551\u8BFE\u7A0B \xB7 \u9694\u5929\u9A8C\u8BC1" : "\u8865\u6551\u8BFE\u7A0B \xB7 \u5DE9\u56FA\u7EC3\u4E60",
    priority: 1,
    remediationId: job.id,
    remediationGroup: g.id,
    remediationPhase: phase,
    scaffold: phase === "practice" && sources.has(q.id) ? "\u5DF2\u8BB2\u89E3\u539F\u9898\uFF1A\u7528\u4E8E\u5DE9\u56FA\uFF0C\u4E0D\u8BA1\u4F5C\u72EC\u7ACB\u8FC1\u79FB\u9A8C\u8BC1" : void 0
  }));
}
function dueRemediation(data, now = Date.now()) {
  return (data.jobs ?? []).filter((j) => j.kind === "remediation").flatMap(
    (j) => j.groups.flatMap((g) => remedyPractice(data, j, g, "verify", now))
  ).slice(0, 2);
}

// lib/engine.ts
var DAY3 = 864e5;
var clamp2 = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
function initial(nodeId, skillId) {
  return {
    nodeId,
    skillId,
    mastery: 0.35,
    stability: 0.5,
    confidence: 0.5,
    lastReviewed: null,
    lastSuccess: null,
    checkpoint: null,
    checkpointVariant: "",
    stage: 0,
    nextReview: null,
    attemptCount: 0,
    errorCount: 0,
    gainDay: "",
    dailyGain: 0,
    lastFailure: null
  };
}
function applyAnswer(old, e) {
  const s = { ...old };
  if (e.voidedBy) return s;
  const now = Date.parse(e.occurredAt);
  if (!Number.isFinite(now) || !Number.isFinite(e.score) || e.score < 0 || e.score > 1)
    return s;
  const validTime = Number.isFinite(e.activeThinkMs) && e.activeThinkMs >= 0 && e.activeThinkMs <= 864e5;
  const minMs = Math.max(1500, Math.min(5e3, e.expectedSeconds * 200));
  let quality = e.source === "rubric" ? 0.95 : 0.85;
  if (!validTime || e.activeThinkMs < minMs) quality *= 0.2;
  if (e.usedHint) quality *= 0.65;
  if (e.learningEvidence?.suspect || e.predictedConfidence === "guess") {
    const confidenceWeight = e.learningEvidence?.policy === "cautious" ? 0.3 : e.learningEvidence?.policy === "expansive" ? 0.5 : 0.4;
    quality *= confidenceWeight;
  }
  const fluency = clamp2(
    Math.sqrt(
      e.expectedSeconds * 1e3 / Math.max(e.expectedSeconds * 1e3, e.activeThinkMs)
    ),
    0.55,
    1
  );
  const sameDay = s.gainDay === e.localDay;
  if (!sameDay) {
    s.gainDay = e.localDay;
    s.dailyGain = 0;
  }
  const reliable2 = e.score >= 0.85 && quality >= 0.65 && !e.usedHint && validTime;
  let advanced = false;
  if (reliable2) {
    s.lastSuccess = e.occurredAt;
    if (!s.checkpoint) {
      s.checkpoint = e.occurredAt;
      s.checkpointVariant = e.variant;
      s.stability = Math.max(1, s.stability);
    } else {
      const gap = [1, 3, 7, Math.max(7, s.stability * 0.6)][s.stage];
      const level = s.mastery < 0.45 ? 1 : s.mastery < 0.7 ? 2 : 3;
      if (now - Date.parse(s.checkpoint) >= gap * DAY3 && s.checkpointVariant !== e.variant && e.difficulty >= level) {
        s.stage = Math.min(3, s.stage + 1);
        s.stability = Math.min(180, s.stability * 3 * fluency);
        s.checkpoint = e.occurredAt;
        s.checkpointVariant = e.variant;
        advanced = true;
      }
    }
  }
  const weight = clamp2(e.evidenceWeight ?? 1);
  const evidence = clamp2((e.score - 0.6) / 0.4, -1, 1) * weight;
  if (evidence > 0) {
    const gain = Math.max(
      0,
      Math.min(
        0.22 * (1 - s.mastery) * evidence * quality * fluency * (0.65 + 0.1 * e.difficulty),
        0.08 - s.dailyGain,
        [0.7, 0.82, 0.91, 0.99][s.stage] - s.mastery
      )
    );
    s.mastery += gain;
    s.dailyGain += gain;
  } else
    s.mastery += (0.12 + 0.2 * s.mastery) * evidence * Math.max(0.6, quality);
  s.mastery = clamp2(s.mastery, 0, 0.99);
  if (e.score < 0.4) {
    s.stability = Math.max(0.25, s.stability * 0.25);
    s.stage = 0;
    s.checkpoint = null;
    s.lastFailure = e.occurredAt;
    s.errorCount++;
  }
  const cap = s.mastery < 0.45 ? 1 : s.mastery < 0.65 ? 3 : s.mastery < 0.8 ? 7 : s.mastery < 0.9 ? 14 : 180;
  let interval = e.score < 0.4 ? 1 : e.score < 0.65 ? Math.min(1, Math.max(0.25, s.stability * 0.35)) : Math.min(
    cap,
    s.stability * (0.8 + 0.7 * s.mastery) * fluency * clamp2(quality / 0.85, 0.25, 1)
  );
  let due = now + interval * DAY3;
  if (e.score >= 0.65 && e.learningEvidence?.intervalFactor && !e.learningEvidence.suspect) {
    interval = Math.min(
      cap,
      interval * clamp2(e.learningEvidence.intervalFactor, 0.55, 1.5)
    );
    due = now + interval * DAY3;
  }
  if (s.stage < 3 && s.checkpoint)
    due = Math.min(due, Date.parse(s.checkpoint) + [1, 3, 7][s.stage] * DAY3);
  if (sameDay && old.nextReview && !advanced)
    due = Math.min(due, Date.parse(old.nextReview));
  s.nextReview = new Date(Math.max(now + 6e4, due)).toISOString();
  s.lastReviewed = e.occurredAt;
  s.attemptCount++;
  s.confidence = 0.9 * s.confidence + 0.1 * quality;
  return s;
}
function computeMastery(nodes, events) {
  const map = {};
  for (const n of nodes)
    for (const skill of n.skills)
      map[keyOf(n.id, skill.id)] = initial(n.id, skill.id);
  const seen = /* @__PURE__ */ new Set();
  for (const e of [...events].sort(
    (a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id)
  )) {
    if (e.voidedBy) continue;
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    const targets = e.targets?.length ? e.targets : [{ skillId: e.skillId, score: e.score, weight: 1 }];
    for (const target of targets) {
      const k = keyOf(e.nodeId, target.skillId);
      map[k] = applyAnswer(map[k] ?? initial(e.nodeId, target.skillId), {
        ...e,
        skillId: target.skillId,
        score: target.score,
        evidenceWeight: target.weight * (e.evidenceWeight ?? 1)
      });
    }
  }
  return map;
}
function forgettingRisk(s, now = Date.now()) {
  return s.lastSuccess ? clamp2(
    1 - Math.exp(
      -Math.max(0, now - Date.parse(s.lastSuccess)) / DAY3 / Math.max(0.25, s.stability)
    )
  ) : 0;
}
function nodeMastery(n, states) {
  const items = n.skills.map((x) => states[keyOf(n.id, x.id)]).filter((x) => x?.attemptCount);
  return items.length ? items.reduce((a, s) => a + s.mastery, 0) / items.length : null;
}
function priority(n, s, events, exams, now) {
  events = events.filter((e) => !e.voidedBy);
  const today = localDay(new Date(now));
  const done = events.filter(
    (e) => e.nodeId === n.id && e.skillId === s.skillId && e.localDay === today
  );
  const errors = events.filter(
    (e) => e.nodeId === n.id && e.skillId === s.skillId && now - Date.parse(e.occurredAt) < 14 * DAY3
  ).reduce(
    (a, e) => a + (1 - e.score) * Math.exp(-(now - Date.parse(e.occurredAt)) / DAY3 / 3),
    0
  );
  const exam = Math.max(
    0,
    ...exams.filter(
      (e) => e.subject === n.subject && (!e.scope.length || e.scope.includes(n.id)) && Date.parse(e.date + "T23:59:59") >= now
    ).map(
      (e) => clamp2(1 - (Date.parse(e.date) - now) / DAY3 / 21) * n.examWeight
    )
  );
  const overdue = s.nextReview ? clamp2((now - Date.parse(s.nextReview)) / DAY3 / Math.max(1, s.stability)) : 1;
  return (0.28 * (1 - s.mastery) + 0.22 * forgettingRisk(s, now) + 0.15 * clamp2(errors) + 0.15 * exam + 0.08 * n.importance + 0.05 * overdue) / (1 + 0.45 * done.length);
}
function hash(s) {
  let n = 2166136261;
  for (const c of s) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return (n >>> 0) / 4294967296;
}
function buildQueue(data, opts = {}) {
  data = {
    ...data,
    questions: data.questions.filter((q) => q.reviewStatus !== "paused")
  };
  const now = opts.now ?? Date.now(), today = localDay(new Date(now));
  const states = computeMastery(data.nodes, data.events);
  const events = cleanEvents(data.events, now);
  const fingerprints = memoryFingerprint(data, now);
  const diagnosis = cognitiveDiagnosis(data, opts.subject, now);
  const target = opts.limit ?? Math.max(5, Math.floor(data.settings.dailyMinutes * 60 / 55));
  const active = data.nodes.filter(
    (n) => (!opts.subject || n.subject === opts.subject) && (!opts.subjects?.length || opts.subjects.includes(n.subject)) && (!opts.scope?.length || opts.scope.includes(n.id))
  );
  const candidates = [];
  const mastered = [];
  for (const n of active)
    for (const skill of n.skills) {
      const s = states[keyOf(n.id, skill.id)] ?? initial(n.id, skill.id);
      const history = events.filter(
        (e) => e.nodeId === n.id && e.skillId === skill.id
      );
      const practiced = history.filter((e) => e.localDay === today);
      if (!opts.test && practiced.length >= 4) continue;
      const high = s.mastery >= 0.9 && s.stage === 3;
      const due = !s.nextReview || Date.parse(s.nextReview) <= now;
      if (!opts.practice && !opts.test && !due && !(s.mastery < 0.45 && practiced.length < 2)) {
        if (!(high && data.settings.surprise && s.lastReviewed && now - Date.parse(s.lastReviewed) >= 7 * DAY3))
          continue;
      }
      const flow = flowDifficulty(data, n.id, skill.id, s.mastery, now, events);
      const desired = flow.difficulty;
      const qs = data.questions.filter(
        (q) => !q.tags.includes("exam-only") && !q.tags.includes("course-check") && (!q.tags.includes("course-content") || (data.jobs ?? []).some(
          (c) => c.kind === "course" && c.sections?.some(
            (section) => section.content && q.id.startsWith(
              "lesson-q:" + section.id + ":" + section.revision + ":practice:"
            )
          )
        )) && q.nodeId === n.id && q.skillId === skill.id && (!q.expiresAt || Date.parse(q.expiresAt) > now)
      ).sort((a, b) => {
        const last = (id) => history.filter((e) => e.questionId === id).at(-1)?.occurredAt ?? "1970";
        const rank = (q) => Math.abs(q.difficulty - desired) * 2 + (practiced.some((e) => e.questionId === q.id) ? 20 : 0) + (last(q.id) !== "1970" ? 1 : 0) + hash(today + q.id);
        return rank(a) - rank(b);
      });
      for (const q of qs.slice(0, 2)) {
        let reason = !s.attemptCount ? "\u521D\u6B21\u8BCA\u65AD" : s.mastery < 0.45 ? "\u5DE9\u56FA\u57FA\u7840" : due ? "\u95F4\u9694\u590D\u4E60" : "\u4E13\u9879\u7EC3\u4E60";
        let p = priority(n, s, data.events, data.exams, now);
        const weakness = diagnosis.find(
          (d) => d.subject === n.subject && d.identifiable && d.deficit > 0.7 && attributesFor(q, n).includes(d.attribute)
        );
        if (weakness && !opts.test) {
          p += 0.12;
          reason = "\u80FD\u529B\u8BCA\u65AD \xB7 " + weakness.title;
        }
        const fingerprint = fingerprints.find(
          (f) => f.family === memoryFamily(q, n)
        );
        if (fingerprint?.ready && fingerprint.factor < 0.9) p += 0.04;
        const recent2 = history.slice().sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0];
        if (recent2?.predictedConfidence === "sure" && recent2.score < 0.6) {
          p += 0.15;
          reason = "\u4FE1\u5FC3\u6821\u51C6";
        }
        const weakPre = n.prerequisites.map((id) => data.nodes.find((x) => x.id === id)).filter(Boolean).find((x) => (nodeMastery(x, states) ?? 0.35) < 0.45);
        if (weakPre && s.mastery < 0.45) {
          p *= 0.8;
          reason = "\u57FA\u7840\u8BCA\u65AD";
        }
        if (data.exams.some(
          (e) => e.subject === n.subject && (!e.scope.length || e.scope.includes(n.id)) && Date.parse(e.date) > now && Date.parse(e.date) - now < 14 * DAY3
        ))
          reason = "\u8003\u8BD5\u51C6\u5907";
        const item = {
          question: q,
          priority: p,
          reason,
          scaffold: s.mastery < 0.35 ? n.description : void 0,
          predictedSuccess: flow.levels.find(
            (l) => l.difficulty === q.difficulty
          )?.probability
        };
        if (high && !due && !opts.practice && !opts.test) {
          item.reason = "\u968F\u673A\u62BD\u67E5";
          mastered.push(item);
        } else candidates.push(item);
      }
    }
  for (const c of candidates) {
    if (active.some((n) => n.prerequisites.includes(c.question.nodeId))) {
      c.priority += 0.07;
      if (c.reason === "\u5DE9\u56FA\u57FA\u7840") c.reason = "\u524D\u7F6E\u8BCA\u65AD";
    }
  }
  candidates.sort(
    (a, b) => b.priority - a.priority || hash(today + a.question.id) - hash(today + b.question.id)
  );
  const queue = [];
  const perSkill = /* @__PURE__ */ new Map();
  let seconds = 0;
  while (candidates.length && queue.length < target) {
    const idx = candidates.findIndex((c2) => {
      const k2 = keyOf(c2.question.nodeId, c2.question.skillId);
      return (perSkill.get(k2) ?? 0) < 2 && !queue.slice(-3).some((x) => keyOf(x.question.nodeId, x.question.skillId) === k2) && queue.at(-1)?.question.nodeId !== c2.question.nodeId && !queue.some((x) => x.question.id === c2.question.id);
    });
    if (idx < 0) break;
    const c = candidates.splice(idx, 1)[0];
    if (!opts.test && seconds + c.question.expectedSeconds > data.settings.dailyMinutes * 60 && queue.length)
      continue;
    queue.push(c);
    seconds += c.question.expectedSeconds;
    const k = keyOf(c.question.nodeId, c.question.skillId);
    perSkill.set(k, (perSkill.get(k) ?? 0) + 1);
  }
  const surpriseCount = data.settings.surprise && !opts.practice && !opts.test ? Math.min(
    Math.floor(target * 0.075) + (hash(today + "surprise") < target * 0.075 % 1 ? 1 : 0),
    Math.ceil(target * 0.1)
  ) : 0;
  const pool = mastered.sort(
    (a, b) => hash(today + a.question.id) - hash(today + b.question.id)
  );
  const used = /* @__PURE__ */ new Set();
  for (const c of pool) {
    if (used.size >= surpriseCount) break;
    const k = keyOf(c.question.nodeId, c.question.skillId);
    if (used.has(k)) continue;
    used.add(k);
    if (queue.length >= target) queue.pop();
    queue.splice(Math.min(queue.length, Math.floor(queue.length * 0.65)), 0, c);
  }
  if (!opts.test) {
    const pending = events.filter(
      (e) => e.learningEvidence?.suspect && active.some((n) => n.id === e.nodeId)
    ).reverse();
    for (const e of pending) {
      const q = verificationCandidate(data, e, [], now);
      if (!q) continue;
      const existing = queue.findIndex((x) => x.question.id === q.id);
      if (existing >= 0) queue.splice(existing, 1);
      if (queue.length >= target) queue.pop();
      queue.splice(Math.min(2, queue.length), 0, {
        question: q,
        reason: "\u53D8\u5F0F\u4EA4\u53C9\u9A8C\u8BC1",
        priority: 1,
        verificationOf: e.id
      });
      break;
    }
    const transfer = transferCandidates(data, opts.subject, now).find(
      (t) => active.some((n) => n.id === t.target.nodeId) && !queue.some((x) => x.question.id === t.target.id)
    );
    if (transfer && queue.length >= 4) {
      if (queue.length >= target) queue.pop();
      queue.push({
        question: { ...transfer.target, transferFrom: transfer.source.id },
        priority: 0.5,
        reason: "\u8DE8\u8BED\u5883\u8FC1\u79FB"
      });
    }
  }
  if (!opts.test)
    for (const item of dueRemediation(data, now).filter(
      (x) => active.some((n) => n.id === x.question.nodeId)
    )) {
      const same = queue.findIndex((x) => x.question.id === item.question.id);
      if (same >= 0) queue.splice(same, 1);
      if (queue.length >= target) queue.pop();
      queue.push(item);
    }
  return queue;
}

// lib/study-assistant.ts
init_model();
init_question_tools();

// lib/exam-outcomes.ts
init_model();
var DEFAULT_GPA = {
  scale: 4,
  formula: "ratio * scale",
  weighted: true
};
var datePattern = /^\d{4}-\d{2}-\d{2}$/;
function validExamDate(date) {
  if (!datePattern.test(date)) return false;
  const parsed = /* @__PURE__ */ new Date(date + "T00:00:00Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}
function validResult(result) {
  return !!result && Number.isFinite(result.score) && Number.isFinite(result.maxScore) && Number.isFinite(result.credits) && result.maxScore > 0 && result.maxScore <= 1e5 && result.score >= 0 && result.score <= result.maxScore && result.credits > 0 && result.credits <= 100 && Number.isFinite(Date.parse(result.recordedAt));
}
function gradePoint(formula, variables) {
  if (!formula.trim() || formula.length > 240)
    throw new Error("\u516C\u5F0F\u957F\u5EA6\u5E94\u4E3A 1\u2013240 \u4E2A\u5B57\u7B26");
  const tokens = formula.match(/\d+(?:\.\d+)?|\.\d+|[a-zA-Z]+|[+\-*/^(),]|\S/g) ?? [];
  if (tokens.length > 120) throw new Error("\u516C\u5F0F\u8FC7\u4E8E\u590D\u6742");
  let i = 0, depth = 0;
  const take = (s) => tokens[i] === s ? (i++, true) : false;
  function atom() {
    if (++depth > 20) throw new Error("\u516C\u5F0F\u62EC\u53F7\u8FC7\u591A");
    let v;
    if (take("(")) {
      v = expression();
      if (!take(")")) throw new Error("\u516C\u5F0F\u7F3A\u5C11\u53F3\u62EC\u53F7");
    } else {
      const token = tokens[i++];
      if (token && /^(?:\d+(?:\.\d+)?|\.\d+)$/.test(token)) v = Number(token);
      else if (token && Object.hasOwn(variables, token)) v = variables[token];
      else if (token && ["min", "max", "floor", "ceil", "round"].includes(token) && take("(")) {
        const args = [expression()];
        while (take(",")) args.push(expression());
        if (!take(")") || args.length !== (token === "min" || token === "max" ? 2 : 1))
          throw new Error("\u51FD\u6570\u53C2\u6570\u4E0D\u6B63\u786E");
        v = token === "min" ? Math.min(...args) : token === "max" ? Math.max(...args) : token === "floor" ? Math.floor(args[0]) : token === "ceil" ? Math.ceil(args[0]) : Math.round(args[0]);
      } else
        throw new Error(
          "\u516C\u5F0F\u4EC5\u652F\u6301\u6570\u5B57\u3001\u56DB\u5219\u8FD0\u7B97\u3001ratio / percent / score / maxScore / scale \u548C min\u3001max\u3001floor\u3001ceil\u3001round"
        );
    }
    depth--;
    return v;
  }
  function power() {
    let v = atom();
    if (take("^")) v = v ** unary();
    return v;
  }
  function unary() {
    if (take("+")) return unary();
    if (take("-")) return -unary();
    return power();
  }
  function product() {
    let v = unary();
    while (tokens[i] === "*" || tokens[i] === "/") {
      const op = tokens[i++], n = unary();
      if (op === "/" && n === 0) throw new Error("\u516C\u5F0F\u4E0D\u80FD\u9664\u4EE5\u96F6");
      v = op === "*" ? v * n : v / n;
    }
    return v;
  }
  function expression() {
    let v = product();
    while (tokens[i] === "+" || tokens[i] === "-") {
      const op = tokens[i++], n = product();
      v = op === "+" ? v + n : v - n;
    }
    return v;
  }
  const result = expression();
  if (i !== tokens.length || !Number.isFinite(result))
    throw new Error("\u516C\u5F0F\u65E0\u6548\u6216\u7ED3\u679C\u4E0D\u662F\u6709\u9650\u6570\u5B57");
  return result;
}
function validateGpaConfig(raw) {
  if (!Number.isFinite(raw.scale) || raw.scale < 1 || raw.scale > 10)
    throw new Error("GPA \u6EE1\u5206\u5E94\u4E3A 1\u201310");
  if (typeof raw.formula !== "string") throw new Error("\u8BF7\u8F93\u5165\u516C\u5F0F");
  if (raw.from && !validExamDate(raw.from) || raw.to && !validExamDate(raw.to) || raw.from && raw.to && raw.from > raw.to)
    throw new Error("\u7EDF\u8BA1\u65E5\u671F\u8303\u56F4\u65E0\u6548");
  const config = {
    scale: raw.scale,
    formula: raw.formula.trim(),
    weighted: raw.weighted !== false,
    from: raw.from || void 0,
    to: raw.to || void 0
  };
  for (const maxScore of [100, 150])
    for (let p = 0; p <= 100; p += 1)
      gradePoint(config.formula, {
        ratio: p / 100,
        percent: p,
        score: p / 100 * maxScore,
        maxScore,
        scale: config.scale
      });
  return config;
}
function gpaConfig(data) {
  try {
    return validateGpaConfig(data.settings.examGpa ?? DEFAULT_GPA);
  } catch {
    return { ...DEFAULT_GPA };
  }
}
function completedExams(data, now = Date.now()) {
  const today = localDay(new Date(now));
  return data.exams.filter((e) => validExamDate(e.date) && e.date <= today).sort((a, b) => b.date.localeCompare(a.date));
}
function pendingExamScores(data, now = Date.now()) {
  const today = localDay(new Date(now));
  return completedExams(data, now).filter(
    (e) => e.date < today && !validResult(e.result) && (!e.scoreReminderAfter || Date.parse(e.scoreReminderAfter) <= now || !Number.isFinite(Date.parse(e.scoreReminderAfter)))
  );
}
function examGpa(data, now = Date.now()) {
  const config = gpaConfig(data), seen = /* @__PURE__ */ new Set(), excluded = [];
  const rows = completedExams(data, now).flatMap((e) => {
    if (seen.has(e.id) || !validResult(e.result) || Date.parse(e.result.recordedAt) > now || config.from && e.date < config.from || config.to && e.date > config.to)
      return [];
    seen.add(e.id);
    try {
      const percent = e.result.score / e.result.maxScore * 100;
      const point = Math.max(
        0,
        Math.min(
          config.scale,
          gradePoint(config.formula, {
            ratio: percent / 100,
            percent,
            score: e.result.score,
            maxScore: e.result.maxScore,
            scale: config.scale
          })
        )
      );
      return [
        {
          exam: e,
          percent,
          point,
          weight: config.weighted ? e.result.credits : 1
        }
      ];
    } catch {
      excluded.push(e.id);
      return [];
    }
  });
  const weight = rows.reduce((s, r) => s + r.weight, 0);
  return {
    config,
    rows,
    excluded,
    value: weight ? rows.reduce((s, r) => s + r.point * r.weight, 0) / weight : null
  };
}
function examFeedback(data, subject, nodeId, now = Date.now()) {
  const latest = completedExams(data, now).find(
    (e) => e.subject === subject && validResult(e.result) && Date.parse(e.result.recordedAt) <= now && (!nodeId || !e.scope.length || e.scope.includes(nodeId))
  );
  if (!latest || !validResult(latest.result)) return null;
  const age = Math.max(
    0,
    (now - Date.parse(latest.date + "T00:00:00")) / 864e5
  );
  if (age > 90) return null;
  const percent = latest.result.score / latest.result.maxScore * 100, target = Number.isFinite(latest.target) ? latest.target : 80;
  return {
    exam: latest,
    percent,
    target,
    gap: Math.max(0, target - percent) / 100,
    boost: Math.min(0.35, Math.max(0, target - percent) / 100 * 0.7) * (1 - age / 90),
    reason: latest.title + "\uFF1A" + Math.round(percent) + "%\uFF0C\u76EE\u6807 " + target + "%\uFF1B\u7528\u76F8\u5173\u7EC3\u4E60\u786E\u8BA4\u5931\u5206\u539F\u56E0\u3002"
  };
}

// lib/study-assistant.ts
var clamp3 = (n, low = 0, high = 1) => Math.max(low, Math.min(high, n));
var mean2 = (xs) => xs.length ? xs.reduce((sum, x) => sum + x, 0) / xs.length : 0;
var duration = (seconds) => Number.isFinite(seconds) ? clamp3(seconds, 15, 1200) : 60;
var parsedNow = (now) => Number.isFinite(now) ? now : Date.now();
function assistantSettings(data) {
  const saved = data.settings.assistant;
  const weights = Object.fromEntries(
    SUBJECTS.map(({ id }) => {
      const n = saved?.weights?.[id];
      return [
        id,
        typeof n === "number" && Number.isFinite(n) ? clamp3(n, 0, 5) : 3
      ];
    })
  );
  const minutes = saved?.dailyMinutes ?? data.settings.dailyMinutes;
  return {
    version: 1,
    onboardedAt: saved?.onboardedAt,
    weights,
    dailyMinutes: typeof minutes === "number" && Number.isFinite(minutes) ? clamp3(minutes, 10, 120) : 20
  };
}
function assistantObservations(data, now) {
  const questions = new Map(data.questions.map((q) => [q.id, q]));
  const nodes = new Map(data.nodes.map((n) => [n.id, n]));
  const seen = /* @__PURE__ */ new Set();
  return cleanEvents(data.events, now).filter((e) => {
    const q = questions.get(e.questionId), node = nodes.get(e.nodeId);
    if (!q || q.reviewStatus === "paused" || !node || q.nodeId !== e.nodeId || q.skillId !== e.skillId || q.subject !== e.subject || node.subject !== e.subject || !node.skills.some((s) => s.id === e.skillId))
      return false;
    const fingerprint = [e.sessionId, e.questionId, e.occurredAt].join("|");
    if (seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
  });
}
function reliableAssistantEvent(e) {
  return Number.isFinite(e.activeThinkMs) && e.activeThinkMs > 0 && e.activeThinkMs <= DAY3 && Number.isFinite(e.expectedSeconds) && e.expectedSeconds > 0 && (e.evidenceWeight === void 0 || e.evidenceWeight > 0) && !e.usedHint && !e.learningEvidence?.suspect && !e.learningEvidence?.timedOut && e.predictedConfidence !== "guess" && evidenceReliability(e) >= 0.8;
}
var observations = assistantObservations;
var reliable = reliableAssistantEvent;
function dayOf(e) {
  return localDay(new Date(e.occurredAt));
}
function examDays(date, now) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return Infinity;
  const at = (/* @__PURE__ */ new Date(date + "T23:59:59")).getTime();
  return at >= now ? (at - now) / DAY3 : Infinity;
}
var STAGE_TITLES = {
  prerequisite: "\u5148\u8865\u524D\u7F6E\u57FA\u7840",
  recall: "\u5230\u671F\u4E3B\u52A8\u56DE\u5FC6",
  learn: "\u5B66\u4E60\u4E0E\u57FA\u7840\u5DE9\u56FA",
  verify: "\u95F4\u9694\u4E0E\u53D8\u5F0F\u9A8C\u8BC1"
};
function dailyStudyPlan(data, now = Date.now()) {
  now = parsedNow(now);
  const settings = assistantSettings(data), today = localDay(new Date(now));
  const events = observations(data, now), safe = { ...data, events };
  const states = computeMastery(data.nodes, events);
  const activeQuestions = data.questions.filter(
    (q) => reusable(q, now) && settings.weights[q.subject] > 0 && data.nodes.some(
      (n) => n.id === q.nodeId && n.subject === q.subject && n.skills.some((s) => s.id === q.skillId)
    )
  );
  const available = new Set(
    activeQuestions.map((q) => keyOf(q.nodeId, q.skillId))
  );
  const history = /* @__PURE__ */ new Map();
  for (const e of events) {
    const key = keyOf(e.nodeId, e.skillId), rows = history.get(key) ?? [];
    rows.push(e);
    history.set(key, rows);
  }
  const skills = data.nodes.flatMap(
    (n) => n.skills.filter((s) => available.has(keyOf(n.id, s.id))).map((s) => {
      const key = keyOf(n.id, s.id), rows = history.get(key) ?? [], proof = rows.filter(reliable);
      const days = new Set(proof.map(dayOf)).size, tasks = new Set(proof.map((e) => e.questionId)).size;
      const state = !rows.length ? "unknown" : proof.length < 2 ? "developing" : mean2(proof.slice(-4).map((e) => e.score)) < 0.6 ? "fragile" : days >= 3 && tasks >= 2 && (states[key]?.stage ?? 0) >= 1 ? "retained" : "developing";
      return {
        key,
        nodeId: n.id,
        skillId: s.id,
        subject: n.subject,
        title: n.title + " \xB7 " + s.title,
        state,
        observations: rows.length,
        reliableObservations: proof.length,
        days,
        mastery: rows.length ? states[key]?.mastery ?? null : null
      };
    })
  );
  const skillMap = new Map(skills.map((s) => [s.key, s]));
  const completedSeconds = Math.round(
    events.filter((e) => dayOf(e) === today).reduce(
      (sum, e) => sum + (Number.isFinite(e.activeThinkMs) && e.activeThinkMs > 0 ? Math.min(e.activeThinkMs / 1e3, duration(e.expectedSeconds) * 3) : 0),
      0
    )
  );
  const budgetSeconds = Math.round(settings.dailyMinutes * 60), remainingSeconds = Math.max(0, budgetSeconds - completedSeconds);
  const base = buildQueue(
    {
      ...safe,
      settings: { ...data.settings, dailyMinutes: settings.dailyMinutes }
    },
    { practice: true, limit: Math.max(20, activeQuestions.length), now }
  );
  const baseMap = new Map(base.map((item) => [item.question.id, item]));
  const fingerprints = memoryFingerprint(safe, now);
  const blocked = /* @__PURE__ */ new Map();
  for (const n of data.nodes) {
    const prerequisites = n.prerequisites.filter((id) => {
      const pre = data.nodes.find((p) => p.id === id);
      if (!pre) return false;
      return pre.skills.some((s) => {
        const info = skillMap.get(keyOf(pre.id, s.id));
        return info && ["unknown", "fragile"].includes(info.state);
      });
    });
    if (prerequisites.length) blocked.set(n.id, prerequisites);
  }
  const prerequisiteIds = new Set([...blocked.values()].flat());
  const candidates = activeQuestions.flatMap((q) => {
    const n = data.nodes.find((n2) => n2.id === q.nodeId);
    if (!n || !available.has(keyOf(q.nodeId, q.skillId))) return [];
    const key = keyOf(q.nodeId, q.skillId), info = skillMap.get(key), state = states[key], rows = history.get(key) ?? [];
    const todayRows = rows.filter((e) => dayOf(e) === today);
    if (todayRows.some((e) => e.questionId === q.id) || todayRows.length >= 2)
      return [];
    const due = !!state?.nextReview && Date.parse(state.nextReview) <= now;
    const cross = baseMap.get(q.id)?.verificationOf;
    if (info.state === "retained" && !due && !cross) return [];
    if (info.state === "developing" && rows.length && !due && !cross) return [];
    const previous = rows.at(-1);
    const delayed = previous && dayOf(previous) !== today && now - Date.parse(previous.occurredAt) >= DAY3 / 2;
    let kind = prerequisiteIds.has(q.nodeId) && info.state !== "retained" ? "prerequisite" : cross ? "verify" : due && info.state !== "unknown" ? "recall" : delayed && info.state === "developing" ? "verify" : "learn";
    const baseReason = kind === "prerequisite" ? info.state === "unknown" ? "\u5148\u786E\u8BA4\u540E\u7EED\u5B66\u4E60\u9700\u8981\u7684\u524D\u7F6E\u80FD\u529B\uFF1B\u672A\u6D4B\u4E0D\u7B49\u4E8E\u4E0D\u4F1A\u3002" : "\u8FD1\u671F\u524D\u7F6E\u80FD\u529B\u4F5C\u7B54\u4E0D\u7A33\u5B9A\uFF0C\u5148\u8865\u57FA\u7840\u3002" : cross ? "\u4E0A\u4E00\u9053\u7B54\u5BF9\u7684\u8BC1\u636E\u4E0D\u8DB3\uFF0C\u4F7F\u7528\u5DF2\u6709\u53D8\u5F0F\u4EA4\u53C9\u9A8C\u8BC1\u3002" : kind === "recall" ? "\u5DF2\u5230\u4E2A\u4EBA\u590D\u4E60\u65F6\u95F4\uFF0C\u5148\u5C1D\u8BD5\u56DE\u5FC6\u518D\u67E5\u770B\u53CD\u9988\u3002" : kind === "verify" ? "\u4E0E\u4E0A\u6B21\u5B66\u4E60\u9694\u5F00\u540E\u91CD\u65B0\u4F5C\u7B54\uFF0C\u68C0\u9A8C\u80FD\u5426\u4FDD\u7559\u3002" : info.state === "unknown" ? "\u5C1A\u65E0\u4F5C\u7B54\u8BC1\u636E\uFF0C\u5148\u8BCA\u65AD\u518D\u51B3\u5B9A\u5B66\u4E60\u6DF1\u5EA6\u3002" : "\u8FD1\u671F\u4F5C\u7B54\u63D0\u793A\u9700\u8981\u5DE9\u56FA\uFF1B\u540C\u65E5\u7EC3\u4E60\u4E0D\u4F1A\u88AB\u8BA4\u4F5C\u957F\u671F\u638C\u63E1\u3002";
    const feedback = examFeedback(data, q.subject, n.id, now);
    const reason = feedback?.boost ? baseReason + " " + feedback.reason : baseReason;
    const exam = Math.min(
      ...data.exams.filter(
        (e) => e.subject === q.subject && (!e.scope.length || e.scope.includes(n.id))
      ).map((e) => examDays(e.date, now)),
      Infinity
    );
    const fingerprint = fingerprints.find(
      (f) => f.family === memoryFamily(q, n)
    );
    const priority2 = (baseMap.get(q.id)?.priority ?? 0.25) * (0.4 + settings.weights[q.subject] / 3) + (kind === "prerequisite" ? 0.35 : due ? 0.3 : 0) + (Number.isFinite(exam) ? 0.35 * clamp3(1 - exam / 28) * clamp3(n.examWeight) : 0) + (state ? forgettingRisk(state, now) * 0.2 : 0) + (fingerprint?.ready && fingerprint.factor < 1 ? 0.05 : 0) + (feedback?.boost ?? 0);
    return [
      {
        kind,
        seconds: duration(q.expectedSeconds),
        item: {
          ...baseMap.get(q.id),
          question: q,
          priority: priority2,
          reason
        },
        reason,
        exam
      }
    ];
  });
  candidates.sort(
    (a, b) => b.item.priority - a.item.priority || a.item.question.id.localeCompare(b.item.question.id)
  );
  const selected = [], perSkill = /* @__PURE__ */ new Map();
  let seconds = 0;
  while (candidates.length) {
    const index = candidates.findIndex((c2) => {
      const q = c2.item.question, key2 = keyOf(q.nodeId, q.skillId);
      if (seconds + c2.seconds > remainingSeconds || (perSkill.get(key2) ?? 0) >= 2)
        return false;
      return !(blocked.get(q.nodeId) ?? []).some(
        (id) => !selected.some((x) => x.item.question.nodeId === id)
      );
    });
    if (index < 0) break;
    const c = candidates.splice(index, 1)[0];
    selected.push(c);
    seconds += c.seconds;
    const key = keyOf(c.item.question.nodeId, c.item.question.skillId);
    perSkill.set(key, (perSkill.get(key) ?? 0) + 1);
  }
  const stages = [];
  for (const c of selected) {
    let stage = stages.at(-1);
    if (!stage || stage.kind !== c.kind) {
      stage = {
        kind: c.kind,
        title: STAGE_TITLES[c.kind],
        seconds: 0,
        items: [],
        reasons: []
      };
      stages.push(stage);
    }
    stage.seconds += c.seconds;
    stage.items.push(c.item);
    if (!stage.reasons.includes(c.reason)) stage.reasons.push(c.reason);
  }
  const recommendations = [];
  for (const { id: subject } of SUBJECTS.filter(
    (s) => settings.weights[s.id] > 0
  )) {
    const subjectSkills = skills.filter((s) => s.subject === subject), questions = activeQuestions.filter(
      (q) => q.subject === subject && objective(q)
    ), initialQuestions = activeQuestions.filter(
      (q) => q.subject === subject && (objective(q) || isPinyin(q))
    );
    if (!initialQuestions.length) continue;
    const subjectEvents = events.filter(
      (e) => e.subject === subject && reliable(e)
    );
    const hasCompletedTest = data.tests.some(
      (t) => Number.isFinite(Date.parse(t.at)) && Date.parse(t.at) <= now && t.eventIds.length > 0 && t.eventIds.every((id) => events.some((e) => e.id === id)) && t.eventIds.some(
        (id) => events.some((e) => e.id === id && e.subject === subject)
      )
    );
    const scope = [...new Set(subjectSkills.map((s) => s.nodeId))];
    const lastTest = Math.max(
      0,
      ...subjectEvents.filter((e) => e.source === "test").map((e) => Date.parse(e.occurredAt))
    );
    const nearest = Math.min(
      Infinity,
      ...data.exams.filter((e) => e.subject === subject).map((e) => examDays(e.date, now))
    );
    const coverage = subjectSkills.length ? subjectSkills.filter((s) => s.reliableObservations > 0).length / subjectSkills.length : 0;
    let mode, reason = "";
    if (!subjectEvents.length && !hasCompletedTest) {
      mode = "initial";
      reason = "\u5148\u7528\u5DF2\u6709\u9898\u76EE\u5B9A\u4F4D\u8D77\u70B9\uFF1B\u62FC\u97F3\u9898\u4EA4\u5377\u540E\u9010\u9898\u81EA\u8BC4\uFF0C\u81EA\u8BC4\u4E0E\u5BA2\u89C2\u8BC1\u636E\u5206\u522B\u4FDD\u7559\uFF0C\u672A\u6D4B\u8BD5\u80FD\u529B\u4FDD\u6301\u672A\u77E5\u3002";
    } else if (now - lastTest >= 7 * DAY3 && nearest <= 14 && coverage >= 0.6 && new Set(subjectEvents.map(dayOf)).size >= 3 && subjectSkills.some((s) => s.state === "retained")) {
      mode = "pressure";
      reason = "\u8003\u8BD5\u4E34\u8FD1\uFF0C\u4E14\u5DF2\u6709\u8DE8\u65E5\u666E\u901A\u4F5C\u7B54\u57FA\u7EBF\uFF0C\u53EF\u6BD4\u8F83\u9650\u65F6\u8868\u73B0\u4E0E\u5E73\u65F6\u8868\u73B0\u3002";
    } else if (now - lastTest >= 7 * DAY3 && (coverage < 0.6 || nearest <= 28 || subjectEvents.filter((e) => now - Date.parse(e.occurredAt) <= 14 * DAY3).length >= 12)) {
      mode = "test";
      reason = coverage < 0.6 ? "\u5DF2\u5B66\u5185\u5BB9\u4ECD\u6709\u672A\u6D4B\u80FD\u529B\uFF0C\u7528\u77ED\u6D4B\u8865\u8DB3\u8986\u76D6\u3002" : nearest <= 28 ? "\u8003\u8BD5\u8FDB\u5165\u51C6\u5907\u7A97\u53E3\uFF0C\u7528\u5DF2\u6709\u9898\u76EE\u68C0\u67E5\u9636\u6BB5\u8868\u73B0\u3002" : "\u8FD1\u671F\u5DF2\u79EF\u7D2F\u7EC3\u4E60\u8BC1\u636E\uFF0C\u4F7F\u7528\u77ED\u6D4B\u9A8C\u8BC1\u662F\u5426\u53EF\u4EE5\u72EC\u7ACB\u5B8C\u6210\u3002";
    }
    if (!mode) continue;
    const pool = mode === "pressure" ? pressureQuestions(safe, states, subject, scope, now) : mode === "initial" ? initialQuestions : questions;
    const seenSkills = /* @__PURE__ */ new Set();
    const ordered = [...pool].sort(
      (a, b) => Number(subjectEvents.some((e) => e.questionId === a.id)) - Number(subjectEvents.some((e) => e.questionId === b.id)) || a.id.localeCompare(b.id)
    );
    const testItems = ordered.filter((q) => {
      const key = keyOf(q.nodeId, q.skillId);
      if (seenSkills.has(key)) return false;
      seenSkills.add(key);
      return true;
    }).slice(0, mode === "initial" ? 8 : 10).map((question) => ({ question, reason, priority: 1 }));
    if (testItems.length)
      recommendations.push({
        mode,
        subject,
        scope,
        title: subjectName(subject) + (mode === "initial" ? "\u9996\u6B21\u80FD\u529B\u5B9A\u4F4D" : mode === "pressure" ? "\u8003\u524D\u538B\u529B\u6D4B\u8BD5" : "\u9636\u6BB5\u77ED\u6D4B"),
        reason,
        questions: testItems
      });
  }
  recommendations.sort(
    (a, b) => Number(a.mode !== "initial") - Number(b.mode !== "initial") || (b.subject === "all" ? 0 : settings.weights[b.subject]) - (a.subject === "all" ? 0 : settings.weights[a.subject])
  );
  const initialSubjects = recommendations.filter((r) => r.mode === "initial");
  if (initialSubjects.length > 1) {
    const questions = [];
    for (let index = 0; questions.length < 12; index++) {
      const round = initialSubjects.flatMap(
        (r) => r.questions[index] ? [r.questions[index]] : []
      );
      if (!round.length) break;
      questions.push(...round.slice(0, 12 - questions.length));
    }
    recommendations.unshift({
      mode: "initial",
      subject: "all",
      scope: [...new Set(questions.map((q) => q.question.nodeId))],
      title: "\u9996\u6B21\u7EFC\u5408\u80FD\u529B\u5B9A\u4F4D",
      reason: "\u8986\u76D6\u5DF2\u5BFC\u5165\u4E14\u91CD\u89C6\u7684\u5B66\u79D1\uFF0C\u4EE5\u5C11\u91CF\u4EE3\u8868\u9898\u786E\u8BA4\u8D77\u70B9\uFF1B\u672A\u6D4B\u80FD\u529B\u4FDD\u6301\u672A\u77E5\u3002",
      questions
    });
  }
  return {
    date: today,
    settings,
    queue: selected.map((c) => c.item),
    stages,
    skills,
    recommendations,
    budgetSeconds,
    completedSeconds,
    remainingSeconds,
    scheduledSeconds: seconds,
    minutes: Math.ceil(seconds / 60),
    missingSubjects: SUBJECTS.filter(
      (s) => settings.weights[s.id] > 0 && !activeQuestions.some((q) => q.subject === s.id)
    ).map((s) => s.id),
    status: !activeQuestions.length ? "\u9700\u8981\u5BFC\u5165\u5B66\u4E60\u5185\u5BB9" : !remainingSeconds ? "\u4ECA\u65E5\u5B66\u4E60\u65F6\u95F4\u5DF2\u5B8C\u6210" : !selected.length ? "\u4ECA\u5929\u6682\u65E0\u5230\u671F\u4EFB\u52A1\uFF1B\u53EF\u9009\u62E9\u9636\u6BB5\u77ED\u6D4B" : "\u4ECA\u65E5\u8BA1\u5212\u5DF2\u6839\u636E\u73B0\u6709\u5B66\u4E60\u8BC1\u636E\u8C03\u6574",
    methodology: "\u8FD9\u662F\u4F9D\u636E\u4E3B\u52A8\u56DE\u5FC6\u3001\u95F4\u9694\u5B66\u4E60\u539F\u5219\u4E0E\u4E2A\u4EBA\u5386\u53F2\u7684\u900F\u660E\u7ECF\u9A8C\u8BA1\u5212\uFF1B\u8BC1\u636E\u4E0D\u8DB3\u65F6\u4FDD\u6301\u672A\u77E5\uFF0C\u4E0D\u627F\u8BFA\u79D1\u5B66\u6700\u4F18\u3002"
  };
}
function completedWeek(now = Date.now()) {
  const current = new Date(parsedNow(now));
  current.setHours(0, 0, 0, 0);
  current.setDate(current.getDate() - (current.getDay() + 6) % 7);
  const start = new Date(current);
  start.setDate(start.getDate() - 7);
  const last = new Date(current);
  last.setDate(last.getDate() - 1);
  return {
    id: localDay(start),
    start: start.toISOString(),
    endExclusive: current.toISOString(),
    startDate: localDay(start),
    endDate: localDay(last),
    releasedOn: localDay(current)
  };
}
function weeklyLearningGpa(data, now = Date.now()) {
  now = parsedNow(now);
  const period = completedWeek(now), from = Date.parse(period.start), until = Date.parse(period.endExclusive);
  const events = observations(data, Math.min(now, until - 1));
  const settings = assistantSettings(data);
  const eligible = events.filter(
    (e) => reliable(e) && !e.learningEvidence?.pressure && settings.weights[e.subject] > 0
  );
  const previous = /* @__PURE__ */ new Map(), dailyQuestions = /* @__PURE__ */ new Set(), trials = [];
  const week = [];
  for (const e of eligible) {
    const key = keyOf(e.nodeId, e.skillId), old = previous.get(key), at = Date.parse(e.occurredAt);
    const dailyKey = e.questionId + "|" + dayOf(e);
    if (dailyQuestions.has(dailyKey)) continue;
    dailyQuestions.add(dailyKey);
    if (at >= from) week.push(e);
    if (at >= from && old && old.score >= 0.85 && dayOf(e) !== dayOf(old) && at - Date.parse(old.occurredAt) >= DAY3 / 2 && at - Date.parse(old.occurredAt) <= 180 * DAY3 && Math.abs(old.difficulty - e.difficulty) <= 1)
      trials.push(e);
    previous.set(key, e);
  }
  const available = new Set(
    data.questions.filter((q) => reusable(q, until - 1) && settings.weights[q.subject] > 0).map((q) => keyOf(q.nodeId, q.skillId))
  );
  const tested = new Set(
    week.filter((e) => available.has(keyOf(e.nodeId, e.skillId))).map((e) => keyOf(e.nodeId, e.skillId))
  );
  const days = new Set(week.map(dayOf)).size, trialSkills = new Set(trials.map((e) => keyOf(e.nodeId, e.skillId))).size;
  const accuracy = trials.length ? mean2(trials.map((e) => e.score)) : null;
  const coverage = available.size ? tested.size / available.size : 0;
  const distributed = clamp3(days / 4);
  const sufficient = trials.length >= 8 && days >= 3 && trialSkills >= 2 && available.size > 0;
  const value = sufficient ? Math.round(
    4 * (0.7 * accuracy + 0.2 * coverage + 0.1 * distributed) * 100
  ) / 100 : null;
  return {
    period,
    value,
    label: "\u5B66\u4E60 GPA\uFF08\u975E\u5B98\u65B9\u6210\u7EE9\uFF09",
    sample: trials.length,
    reliableAnswers: week.length,
    days,
    trialSkills,
    coverage,
    testedSkills: tested.size,
    availableSkills: available.size,
    components: {
      accuracy: { value: accuracy, weight: 0.7, title: "\u53EF\u9760\u95F4\u9694\u4F5C\u7B54\u8868\u73B0" },
      coverage: { value: coverage, weight: 0.2, title: "\u5DF2\u6D4B\u80FD\u529B\u8986\u76D6" },
      distribution: {
        value: distributed,
        weight: 0.1,
        title: "\u5206\u6563\u5B66\u4E60\uFF08\u56DB\u5929\u8FBE\u6807\uFF09"
      }
    },
    reason: sufficient ? "\u4E0A\u4E00\u4E2A\u5DF2\u7ED3\u675F\u5468\u7684\u53EF\u9760\u95F4\u9694\u4F5C\u7B54\u3001\u5DF2\u6D4B\u8986\u76D6\u53CA\u5206\u6563\u5B66\u4E60\u7EFC\u5408\u4F30\u8BA1\u3002" : "\u6837\u672C\u4E0D\u8DB3\uFF1A\u81F3\u5C11\u9700\u8981 8 \u6B21\u53EF\u9760\u95F4\u9694\u4F5C\u7B54\u30013 \u4E2A\u5B66\u4E60\u65E5\u548C 2 \u79CD\u80FD\u529B\uFF1B\u4E0D\u4F1A\u4EE5 XP \u6216\u540C\u65E5\u8FDE\u5237\u4EE3\u66FF\u8BC1\u636E\u3002",
    caveat: "0\u20134 \u5206\u662F\u672C\u7CFB\u7EDF\u7684\u5B66\u4E60\u8FC7\u7A0B\u6307\u6807\uFF0C\u4E0D\u7B49\u4E8E\u5B66\u6821 GPA\u3002\u8986\u76D6\u7387\u6309\u5F53\u524D\u5DF2\u5BFC\u5165\u5185\u5BB9\u4E0E\u5B66\u79D1\u6743\u91CD\u8BA1\u7B97\uFF0C\u64A4\u9500\u65E7\u4E8B\u4EF6\u6216\u4FEE\u8BA2\u4E89\u8BAE\u9898\u540E\u4F1A\u91CD\u65B0\u6838\u7B97\u3002"
  };
}

// lib/study-orchestrator.ts
init_exam_model();
init_question_tools();

// lib/study-advice.ts
init_model();
function cachedStudyAdvice(data, actions, now = Date.now()) {
  return (data.jobs ?? []).filter(
    (j) => j.kind === "study-advice" && j.status === "complete" && Date.parse(j.at) <= now && Date.parse(j.expires) > now && typeof j.explanation === "string" && j.explanation.length <= 600 && j.actionIds?.includes(j.actionId) && actions.some(
      (a) => a.id === j.actionId && [
        "practice",
        "initial",
        "test",
        "pressure",
        "simulation",
        "course",
        "remedy",
        "report"
      ].includes(a.kind)
    )
  ).sort((a, b) => b.at.localeCompare(a.at))[0];
}

// lib/study-orchestrator.ts
init_model();
var time = (s) => s ? Date.parse(s) : NaN;
var recent = (s, now, days) => Number.isFinite(time(s)) && time(s) <= now && now - time(s) < days * DAY3;
var qMinutes = (items) => Math.max(
  1,
  Math.ceil(
    items.reduce(
      (s, i) => s + Math.max(15, Math.min(1200, i.question.expectedSeconds || 60)),
      0
    ) / 60
  )
);
var dateDays = (date, now) => validExamDate(date) ? Math.round(
  (Date.parse(date + "T12:00:00") - new Date(
    new Date(now).getFullYear(),
    new Date(now).getMonth(),
    new Date(now).getDate(),
    12
  ).getTime()) / DAY3
) : Infinity;
function inferredSimulation(exam) {
  if (exam.simulation) return exam.simulation;
  if (exam.subject !== "ce") return void 0;
  const title = exam.title.toUpperCase();
  const kind = ["SAT", "ACT", "TOEFL", "MAP", "DET"].find(
    (k) => new RegExp("(?:^|[^A-Z])" + k + "(?:$|[^A-Z])").test(title)
  ) ?? (/托福|TOFEL/.test(title) ? "TOEFL" : /多邻国|DUOLINGO/.test(title) ? "DET" : void 0);
  return kind ? {
    exam: kind,
    mapSection: kind === "MAP" && /LANGUAGE|语言/.test(title) ? "Language Usage" : kind === "MAP" ? "Reading" : void 0
  } : void 0;
}
function simulationMatches(p, spec) {
  return p.exam === spec.exam && (!spec.paperId || p.id === spec.paperId) && (p.exam !== "MAP" || (p.options.mapSection ?? "Reading") === (spec.mapSection ?? "Reading") && (!spec.grade || p.options.grade === spec.grade));
}
function deferred(data, id, now) {
  return data.jobs?.some(
    (j) => j.kind === "study-decision" && j.actionId === id && ["defer", "seen"].includes(j.choice) && Number.isFinite(time(j.at)) && time(j.at) <= now && time(j.until) > now && time(j.until) - time(j.at) <= 8 * DAY3
  );
}
function representative(data, subject, scope, events, now, max = 8) {
  const last = new Map(events.map((e) => [e.questionId, time(e.occurredAt)])), counts = /* @__PURE__ */ new Map();
  return data.questions.filter(
    (q) => reusable(q, now) && (objective(q) || isPinyin(q)) && (subject === "all" || q.subject === subject) && (!scope.length || scope.includes(q.nodeId)) && data.nodes.some(
      (n) => n.id === q.nodeId && n.subject === q.subject && n.skills.some((s) => s.id === q.skillId)
    )
  ).sort(
    (a, b) => (last.get(a.id) ?? 0) - (last.get(b.id) ?? 0) || a.id.localeCompare(b.id)
  ).filter((q) => {
    const k = keyOf(q.nodeId, q.skillId), n = counts.get(k) ?? 0;
    if (n >= 2) return false;
    counts.set(k, n + 1);
    return true;
  }).slice(0, max).map((question) => ({
    question,
    reason: "\u72EC\u7ACB\u4F5C\u7B54\uFF0C\u68C0\u9A8C\u8FD1\u671F\u5B66\u4E60\u6548\u679C",
    priority: 1
  }));
}
function studyAgenda(data, now = Date.now()) {
  if (!Number.isFinite(now)) now = Date.now();
  const plan = dailyStudyPlan(data, now), events = assistantObservations(data, now), reliable2 = events.filter(reliableAssistantEvent), settings = assistantSettings(data), safe = { ...data, events }, today = localDay(new Date(now));
  const jobs = data.jobs ?? [], actions = [], add = (a) => {
    if (!deferred(data, a.id, now)) actions.push(a);
  };
  const active = jobs.filter(
    (j) => ["session", "exam-run", "pressure"].includes(j.kind) && j.status !== "complete" && recent(j.createdAt ?? j.startedAt, now, 180)
  ).sort(
    (a, b) => time(b.createdAt ?? b.startedAt) - time(a.createdAt ?? a.startedAt)
  );
  const resumed = /* @__PURE__ */ new Set();
  for (const j of active) {
    if (resumed.has(j.kind)) continue;
    resumed.add(j.kind);
    if (j.kind === "session" && j.status === "active" && Array.isArray(j.items) && j.items.some(
      (i) => data.questions.some(
        (q) => q.id === i.question.id && reusable(q, now)
      ) && !events.some(
        (e) => e.sessionId === j.id && e.questionId === i.question.id
      )
    ))
      add({
        id: "resume:" + j.id,
        kind: "resume",
        title: j.mode === "test" ? "\u7EE7\u7EED\u672A\u5B8C\u6210\u7684\u6D4B\u8BD5" : "\u63A5\u7740\u4E0A\u6B21\u7684\u5B66\u4E60",
        reason: "\u5F53\u524D\u4F5C\u7B54\u5DF2\u4FDD\u5B58\uFF0C\u5148\u5B8C\u6210\u8FD9\u4E00\u6BB5\u3002",
        label: "\u7EE7\u7EED\u5B66\u4E60",
        minutes: 0,
        priority: 1100,
        page: "study",
        target: j.id
      });
    if (j.kind === "exam-run" && ["active", "break"].includes(j.status)) {
      const p = jobs.find((p2) => p2.kind === "exam-paper" && p2.id === j.paperId);
      if (p && paperReady(p, data.questions))
        add({
          id: "resume:" + j.id,
          kind: "resume",
          title: "\u7EE7\u7EED " + (p.exam === "DET" ? "Duolingo" : p.exam) + " \u6A21\u62DF",
          reason: "\u8BA1\u65F6\u4E0E\u5DF2\u4F5C\u7B54\u5185\u5BB9\u4F1A\u6309\u539F\u8003\u8BD5\u89C4\u5219\u6062\u590D\u3002",
          label: "\u6062\u590D\u8003\u8BD5",
          minutes: 0,
          priority: 1120,
          page: "exam",
          target: j.id
        });
    }
    if (j.kind === "pressure" && j.status === "active" && Array.isArray(j.questions) && j.questions.length)
      add({
        id: "resume:" + j.id,
        kind: "pressure",
        title: "\u7EE7\u7EED\u672A\u5B8C\u6210\u7684\u538B\u529B\u6D4B\u8BD5",
        reason: "\u4F5C\u7B54\u5DF2\u4FDD\u5B58\uFF0C\u539F\u6709\u8BA1\u65F6\u7EE7\u7EED\u751F\u6548\u3002",
        label: "\u6062\u590D\u538B\u529B\u6D4B\u8BD5",
        minutes: Math.max(0, Math.ceil((j.deadline - now) / 6e4)),
        priority: 1110,
        subject: j.subject,
        scope: [],
        items: j.questions.map((question) => ({
          question,
          priority: 1,
          reason: "\u6062\u590D\u538B\u529B\u6D4B\u8BD5"
        }))
      });
  }
  for (const e of pendingExamScores(data, now))
    add({
      id: "score:" + e.id,
      kind: "score",
      title: "\u8003\u8BD5\u7ED3\u675F\u4E86\uFF0C\u8BB0\u5F55\u4E00\u4E0B\u6210\u7EE9",
      reason: e.title + "\u5DF2\u7ED3\u675F " + Math.max(1, dateDays(today, Date.parse(e.date + "T12:00:00"))) + " \u5929\u3002\u586B\u5165\u5F97\u5206\u540E\uFF0C\u518D\u5B89\u6392\u540E\u7EED\u5DE9\u56FA\u3002",
      label: "\u586B\u5199\u8003\u8BD5\u6210\u7EE9",
      minutes: 1,
      priority: 960,
      examId: e.id
    });
  const tests = data.tests.filter(
    (t) => recent(t.at, now, 180) && t.eventIds.length && t.eventIds.every((id) => events.some((e) => e.id === id))
  );
  for (const t of [...tests].sort((a, b) => time(b.at) - time(a.at)).slice(0, 3)) {
    if (!recent(t.at, now, 14) || jobs.some((j) => j.id === "remediation:" + t.sessionId))
      continue;
    const job = buildRemediation(
      { ...data, events },
      t.sessionId,
      t.title,
      now
    );
    const repeated = job.groups.find((g) => g.sources.length >= 2);
    if (!repeated || t.subject !== "all" && !settings.weights[t.subject])
      continue;
    add({
      id: "remedy-create:" + t.sessionId,
      kind: "remedy",
      title: "\u628A\u8FD9\u6B21\u6D4B\u8BD5\u7684\u5171\u540C\u5931\u5206\u6574\u7406\u6E05\u695A",
      reason: repeated.title + "\u6709\u591A\u9053\u5931\u5206\u9898\uFF0C\u5148\u5BF9\u7167\u5171\u540C\u95EE\u9898\uFF0C\u518D\u5B89\u6392\u5DE9\u56FA\u4E0E\u9694\u5929\u9A8C\u8BC1\u3002",
      label: "\u6574\u7406\u8003\u540E\u8865\u6551",
      minutes: 6,
      priority: 720,
      page: "remedy",
      target: job.id,
      sourceSessionId: t.sessionId
    });
  }
  const states = computeMastery(data.nodes, events);
  for (const subject of Object.keys(settings.weights)) {
    if (!settings.weights[subject]) continue;
    const ev = reliable2.filter((e) => e.subject === subject), ordinary = ev.filter(
      (e) => e.source !== "test" && !e.learningEvidence?.pressure
    ), testEvents = ev.filter((e) => e.source === "test");
    const lastTest = Math.max(
      0,
      ...testEvents.map((e) => time(e.occurredAt)),
      ...tests.filter(
        (t) => t.subject === subject || t.eventIds.some((id) => ev.some((e) => e.id === id))
      ).map((t) => time(t.at))
    );
    const practiced = events.filter(
      (e) => e.subject === subject && e.source !== "test" && (reliableAssistantEvent(e) || e.source === "self" && data.questions.some(
        (q) => q.id === e.questionId && isPinyin(q)
      ) && !e.usedHint && !e.learningEvidence?.suspect && e.activeThinkMs >= 3e3)
    ).filter(
      (e) => time(e.occurredAt) > lastTest && now - time(e.occurredAt) <= 14 * DAY3
    );
    const distinct = new Set(practiced.map((e) => e.questionId)).size, skills = new Set(practiced.map((e) => keyOf(e.nodeId, e.skillId))).size;
    const nearest = data.exams.filter((e) => e.subject === subject && dateDays(e.date, now) >= 0).sort((a, b) => a.date.localeCompare(b.date))[0];
    const days = nearest ? dateDays(nearest.date, now) : Infinity, scope = nearest?.scope ?? [];
    const sincePressure = jobs.filter(
      (j) => j.kind === "pressure" && j.status === "complete" && j.subject === subject && Number.isFinite(time(j.completedAt ?? j.startedAt)) && time(j.completedAt ?? j.startedAt) <= now
    );
    const lastPressure = Math.max(
      0,
      ...sincePressure.map((j) => time(j.completedAt ?? j.startedAt)),
      ...ev.filter((e) => e.learningEvidence?.pressure).map((e) => time(e.occurredAt))
    );
    const scoped = ordinary.filter(
      (e) => (!scope.length || scope.includes(e.nodeId)) && now - time(e.occurredAt) <= 30 * DAY3
    );
    const pressure = pressureQuestions(
      safe,
      states,
      subject,
      scope,
      now
    ).filter(
      (q) => !events.some(
        (e) => e.questionId === q.id && now - time(e.occurredAt) < DAY3 / 2
      )
    );
    if (days >= 2 && days <= 7 && now - lastPressure >= 4 * DAY3 && new Set(scoped.map((e) => localDay(new Date(e.occurredAt)))).size >= 2 && scoped.length >= 4 && scoped.reduce((s, e) => s + e.score, 0) / scoped.length >= 0.6 && pressure.length >= 3) {
      const items = pressure.map((question) => ({
        question,
        priority: 1,
        reason: "\u8003\u524D\u9650\u65F6\u9A8C\u8BC1"
      }));
      add({
        id: "pressure:" + nearest.id,
        kind: "pressure",
        title: "\u6765\u4E00\u573A\u8003\u524D\u538B\u529B\u6D4B\u8BD5\uFF1F",
        reason: `\u8DDD\u79BB${nearest.title}\u8FD8\u6709 ${days} \u5929\uFF0C\u5DF2\u6709\u8DE8\u65E5\u7EC3\u4E60\u8BB0\u5F55\uFF0C\u9002\u5408\u6BD4\u8F83\u9650\u65F6\u4E0E\u5E73\u65F6\u8868\u73B0\u3002`,
        label: "\u53C2\u52A0\u538B\u529B\u6D4B\u8BD5",
        minutes: Math.max(2, Math.ceil(qMinutes(items) * 0.8)),
        priority: 880 + settings.weights[subject],
        subject,
        scope,
        items,
        examId: nearest.id
      });
    }
    if (now - lastTest >= DAY3 && distinct >= 8 && skills >= 2 && practiced.reduce((s, e) => s + e.score, 0) / practiced.length >= 0.6) {
      const testedScope = [...new Set(practiced.map((e) => e.nodeId))], items = representative(data, subject, testedScope, events, now);
      if (items.length >= 3)
        add({
          id: "test:" + subject + ":" + lastTest,
          kind: "test",
          title: "\u7EC3\u4E60\u591F\u4E00\u6BB5\u4E86\uFF0C\u6765\u573A\u77ED\u6D4B\uFF1F",
          reason: `\u8FD1\u671F\u5DF2\u5B8C\u6210 ${distinct} \u9053\u6709\u6548\u7EC3\u4E60\uFF0C\u8986\u76D6 ${skills} \u9879\u80FD\u529B\u3002\u7528\u72EC\u7ACB\u4F5C\u7B54\u786E\u8BA4\u54EA\u4E9B\u5DF2\u5B66\u4F1A\u3002`,
          label: "\u53C2\u52A0\u9636\u6BB5\u77ED\u6D4B",
          minutes: qMinutes(items),
          priority: 800 + settings.weights[subject],
          subject,
          scope: testedScope,
          items
        });
    }
    if (!events.some((e) => e.subject === subject) && !tests.some((t) => t.subject === subject)) {
      const items = representative(data, subject, [], events, now, 6);
      if (items.length)
        add({
          id: "initial:" + subject,
          kind: "initial",
          title: "\u5148\u786E\u8BA4" + subjectName(subject) + "\u7684\u5B66\u4E60\u8D77\u70B9",
          reason: "\u4F7F\u7528\u5DF2\u5BFC\u5165\u7684\u4EE3\u8868\u9898\u5B9A\u4F4D\u8D77\u70B9\uFF0C\u518D\u51B3\u5B9A\u5B66\u4E60\u987A\u5E8F\u3002\u62FC\u97F3\u9898\u4ECD\u624B\u52A8\u6838\u5BF9\u3002",
          label: "\u8FDB\u884C\u8D77\u70B9\u6D4B\u8BD5",
          minutes: qMinutes(items),
          priority: 620 + settings.weights[subject],
          subject,
          items
        });
    }
  }
  const imported = jobs.filter(
    (j) => j.kind === "exam-paper" && j.format === EXAM_FORMAT && j.origin === "imported"
  );
  for (const e of data.exams) {
    const days = dateDays(e.date, now), spec = inferredSimulation(e);
    if (!spec || !settings.weights.ce || days < 2 || days > 21) continue;
    const matches = imported.filter((p2) => simulationMatches(p2, spec)), p = matches.filter((p2) => paperReady(p2, data.questions)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    const previous = jobs.filter(
      (j) => j.kind === "exam-run" && j.status === "complete" && matches.some((p2) => p2.id === j.paperId) && recent(j.completedAt, now, 7)
    );
    if (previous.length) continue;
    const mins = p ? Math.ceil(
      examStages(p.exam, p.options).reduce(
        (s, stage) => s + (stage.seconds || stage.count * 75) + stage.breakAfter,
        0
      ) / 60
    ) : 0;
    if (p && mins <= settings.dailyMinutes && (plan.remainingSeconds >= mins * 60 || plan.completedSeconds === 0))
      add({
        id: "simulation:" + e.id + ":" + p.id,
        kind: "simulation",
        title: "\u6309\u8003\u8BD5\u8282\u594F\uFF0C\u5B8C\u6210\u4E00\u573A" + (p.exam === "DET" ? "Duolingo" : p.exam) + " \u6A21\u62DF",
        reason: `\u8DDD\u79BB${e.title}\u8FD8\u6709 ${days} \u5929\u3002\u4F7F\u7528\u4F60\u5DF2\u5BFC\u5165\u7684\u8BD5\u5377\uFF0C\u7ED3\u675F\u540E\u518D\u56DE\u5230\u5B66\u4E60\u8BA1\u5212\u3002`,
        label: "\u53C2\u52A0\u82F1\u8BED\u4E13\u9879\u6A21\u62DF",
        minutes: mins,
        priority: days <= 7 ? 890 : 710,
        examId: e.id,
        paperId: p.id,
        examKind: p.exam,
        subject: "ce"
      });
    else if (!p)
      add({
        id: "import-exam:" + e.id,
        kind: "import-exam",
        title: "\u5148\u4E3A" + spec.exam + "\u51C6\u5907\u4E00\u4EFD\u8BD5\u5377",
        reason: "\u5B8C\u6574\u4E14\u5339\u914D\u7684\u5BFC\u5165\u8BD5\u5377\u5C1A\u672A\u5C31\u7EEA\u3002\u624B\u52A8\u5BFC\u5165\u5373\u53EF\u7EB3\u5165\u5B89\u6392\uFF0C\u4E0D\u4F1A\u81EA\u52A8\u8C03\u7528 AI\u3002",
        label: "\u5BFC\u5165\u6A21\u62DF\u8BD5\u5377",
        minutes: 0,
        priority: 650,
        examKind: spec.exam,
        examId: e.id,
        subject: "ce"
      });
    else
      add({
        id: "simulation-time:" + e.id,
        kind: "import-exam",
        title: "\u4E3A\u5B8C\u6574\u6A21\u62DF\u7559\u51FA\u65F6\u95F4",
        reason: `\u5DF2\u5BFC\u5165\u8BD5\u5377\u7EA6\u9700 ${mins || "\u4E0D\u9650\u65F6"} \u5206\u949F\uFF0C\u5F53\u524D\u5269\u4F59\u65F6\u95F4\u4E0D\u8DB3\u3002\u53EF\u4EE5\u8C03\u6574\u65F6\u95F4\u9884\u7B97\uFF0C\u6216\u5148\u505A\u77ED\u7EC3\u4E60\u3002`,
        label: "\u67E5\u770B\u6A21\u62DF\u5B89\u6392",
        minutes: mins,
        priority: 560,
        examKind: p.exam,
        examId: e.id,
        subject: "ce"
      });
  }
  for (const c of jobs.filter(
    (j) => j.kind === "course" && j.status === "ready" && settings.weights[j.subject] > 0 && Array.isArray(j.sections)
  )) {
    const section = c.sections.find((s) => s.content && !s.completedAt);
    if (section)
      add({
        id: "course:" + c.id + ":" + section.id,
        kind: "course",
        title: "\u628A" + section.title + "\u5B66\u660E\u767D",
        reason: "\u5DF2\u6709\u4E92\u52A8\u8BFE\u4EF6\u5C1A\u672A\u5B8C\u6210\uFF0C\u5148\u7406\u89E3\uFF0C\u518D\u8FDB\u5165\u7EC3\u4E60\u3002",
        label: "\u8FDB\u5165\u4E92\u52A8\u8BFE\u7A0B",
        minutes: 8,
        priority: plan.queue.length ? 400 : 630,
        page: "course",
        target: c.id,
        subject: c.subject
      });
  }
  for (const j of jobs.filter(
    (j2) => j2.kind === "remediation" && Array.isArray(j2.groups)
  )) {
    const group = j.groups.find((g) => {
      const p = remedyProgress(j, g, events, now);
      return !p.successful && (!g.lessonCompletedAt || !p.practices.length || p.ready) && (g.html || g.htmlSections?.length);
    });
    if (group && settings.weights[data.nodes.find((n) => n.id === group.nodeId)?.subject ?? "math"] > 0)
      add({
        id: "remedy:" + j.id + ":" + group.id,
        kind: "remedy",
        title: "\u5148\u89E3\u51B3\u4E00\u7C7B\u53CD\u590D\u51FA\u73B0\u7684\u9519\u8BEF",
        reason: group.title + "\u5DF2\u6709\u8865\u6551\u8BFE\u7A0B\uFF0C\u5B8C\u6210\u540E\u518D\u505A\u53D8\u5F0F\u9A8C\u8BC1\u3002",
        label: "\u8FDB\u5165\u8865\u6551\u8BFE\u7A0B",
        minutes: 6,
        priority: 670,
        page: "remedy",
        target: j.id
      });
  }
  const practice = [];
  let seconds = 0;
  for (const i of plan.queue) {
    const s = Math.max(15, Math.min(1200, i.question.expectedSeconds || 60));
    if (practice.length >= 6 || seconds + s > Math.min(480, plan.remainingSeconds))
      break;
    practice.push(i);
    seconds += s;
  }
  if (!practice.length && plan.queue.length && plan.remainingSeconds >= 15)
    practice.push(plan.queue[0]);
  if (practice.length)
    add({
      id: "practice:" + today,
      kind: "practice",
      title: "\u5148\u5B8C\u6210\u4E00\u5C0F\u6BB5" + (plan.stages[0]?.title ?? "\u590D\u4E60"),
      reason: practice[0].reason,
      label: "\u5F00\u59CB\u8FD9\u6BB5\u5B66\u4E60",
      minutes: qMinutes(practice),
      priority: 500,
      items: practice
    });
  const insights = studyInsights(data, now);
  const checkpoint = practiceCheckpoint(data, now);
  if (checkpoint.blocks.length >= 3)
    add({
      id: "checkpoint:" + checkpoint.blocks[0].sessionId,
      kind: "report",
      title: "\u4E09\u6BB5\u7EC3\u4E60\u5B8C\u6210\uFF0C\u6574\u7406\u4E00\u4E0B\u5F53\u524D\u72B6\u6001",
      reason: `\u5DF2\u5B8C\u6210 ${checkpoint.blocks.length} \u6BB5\u7EC3\u4E60\u3001${checkpoint.events.length} \u6B21\u4F5C\u7B54\u3002${checkpoint.weak.length ? "\u5148\u770B\u770B\u53CD\u590D\u51FA\u9519\u7684\u80FD\u529B\uFF0C\u518D\u8C03\u6574\u4E0B\u4E00\u6B65\u3002" : "\u770B\u770B\u54EA\u4E9B\u5DF2\u7ECF\u7A33\u5B9A\uFF0C\u54EA\u4E9B\u8FD8\u9700\u8981\u9694\u5929\u9A8C\u8BC1\u3002"}`,
      label: "\u67E5\u770B\u9636\u6BB5\u5C0F\u7ED3",
      minutes: 2,
      priority: 835
    });
  const resultStamp = insights.gpa.rows.map((r) => r.exam.result.recordedAt).sort().at(-1);
  if (resultStamp && recent(resultStamp, now, 2))
    add({
      id: "score-report:" + resultStamp,
      kind: "report",
      title: "\u6210\u7EE9\u5DF2\u7ECF\u7EB3\u5165\uFF0C\u770B\u770B\u4E0B\u4E00\u6B65",
      reason: "\u771F\u5B9E\u8003\u8BD5 GPA \u4E0E\u590D\u4E60\u4F18\u5148\u7EA7\u5DF2\u66F4\u65B0\uFF0C\u770B\u770B\u8FD9\u6B21\u8003\u8BD5\u7ED9\u540E\u7EED\u5B66\u4E60\u5E26\u6765\u7684\u53D8\u5316\u3002",
      label: "\u67E5\u770B\u8003\u540E\u56DE\u987E",
      minutes: 2,
      priority: 790
    });
  if (insights.weekCount >= 4)
    add({
      id: "report:" + weeklyLearningGpa(data, now).period.startDate,
      kind: "report",
      title: "\u770B\u770B\u6700\u8FD1\u7684\u5B66\u4E60\u53D8\u5316",
      reason: "\u8FD9\u4E00\u5468\u7684\u5B66\u4E60\u8BB0\u5F55\u5DF2\u6574\u7406\u597D\uFF0C\u770B\u770B\u4FDD\u7559\u6548\u679C\u4E0E\u4E0B\u4E00\u6B65\u5EFA\u8BAE\u3002",
      label: "\u67E5\u770B\u5B66\u4E60\u56DE\u987E",
      minutes: 2,
      priority: new Date(now).getDay() === 1 ? 780 : plan.queue.length ? 450 : 580
    });
  if (!actions.length)
    add({
      id: "rest:" + today,
      kind: data.questions.length || jobs.some((j) => j.kind === "course") ? "rest" : "import",
      title: data.questions.length ? "\u8FD9\u4E00\u6BB5\u5B66\u4E60\u53EF\u4EE5\u544A\u4E00\u6BB5\u843D\u4E86" : "\u4ECE\u4F60\u81EA\u5DF1\u7684\u6559\u6750\u5F00\u59CB",
      reason: data.questions.length ? "\u5F53\u524D\u6CA1\u6709\u66F4\u4F18\u5148\u7684\u5230\u671F\u4EFB\u52A1\u3002\u53EF\u4EE5\u4F11\u606F\uFF0C\u4E5F\u53EF\u4EE5\u81EA\u4E3B\u9009\u62E9\u5B66\u4E60\u65B9\u5F0F\u3002" : "\u5148\u5BFC\u5165\u77E5\u8BC6\u3001\u5B57\u8BCD\u3001\u9898\u76EE\u6216\u8BFE\u4EF6\uFF0C\u5B66\u4E60\u8BA1\u5212\u624D\u6709\u4F9D\u636E\u5B89\u6392\u3002",
      label: data.questions.length ? "\u67E5\u770B\u4E0B\u4E00\u6B65\u5B89\u6392" : "\u5BFC\u5165\u5B66\u4E60\u5185\u5BB9",
      minutes: 0,
      priority: 0,
      page: "library"
    });
  actions.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  const advisor = cachedStudyAdvice(data, actions, now);
  if (advisor && actions[0].priority < 830) {
    const index = actions.findIndex((a) => a.id === advisor.actionId);
    if (index > 0) actions.unshift(...actions.splice(index, 1));
  }
  return {
    primary: actions[0],
    actions,
    practice,
    plan,
    insights,
    date: today,
    advisor,
    checkpoint
  };
}
function practiceCheckpoint(data, now = Date.now()) {
  const events = assistantObservations(data, now), jobs = data.jobs ?? [];
  const after = Math.max(
    0,
    ...jobs.filter(
      (j) => j.kind === "study-decision" && j.choice === "seen" && j.actionId?.startsWith("checkpoint:") && time(j.at) <= now
    ).map((j) => time(j.at))
  );
  const seen = /* @__PURE__ */ new Set();
  const blocks = jobs.filter((j) => j.kind === "study-completion" || j.kind === "game-chest").map((j) => ({ sessionId: String(j.sessionId), at: j.completedAt ?? j.at })).filter((b) => {
    if (seen.has(b.sessionId) || !recent(b.at, now, 30) || time(b.at) <= after || !events.some(
      (e) => e.sessionId === b.sessionId && e.source !== "test" && !e.learningEvidence?.gameRecovery && e.activeThinkMs >= 1500
    ))
      return false;
    seen.add(b.sessionId);
    return true;
  }).sort((a, b) => a.at.localeCompare(b.at));
  const ids = new Set(blocks.map((b) => b.sessionId)), rows = events.filter((e) => ids.has(e.sessionId)), counts = /* @__PURE__ */ new Map();
  for (const e of rows.filter((e2) => e2.score < 0.85)) {
    const k = keyOf(e.nodeId, e.skillId);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const weak = [...counts].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([key, count]) => {
    const [nodeId, skillId] = key.split("::"), n = data.nodes.find((n2) => n2.id === nodeId);
    return {
      key,
      count,
      title: (n?.title ?? "") + " \xB7 " + (n?.skills.find((s) => s.id === skillId)?.title ?? "\u5F85\u5DE9\u56FA\u80FD\u529B")
    };
  });
  return { blocks, events: rows, weak };
}
function studyInsights(data, now = Date.now()) {
  const e = assistantObservations(data, now).filter(reliableAssistantEvent).filter((e2) => !e2.learningEvidence?.pressure), last = e.filter((e2) => now - time(e2.occurredAt) < 7 * DAY3), prior = e.filter(
    (e2) => now - time(e2.occurredAt) >= 7 * DAY3 && now - time(e2.occurredAt) < 14 * DAY3
  );
  const mean3 = (xs) => xs.length ? xs.reduce((s, e2) => s + e2.score, 0) / xs.length : null;
  const current = mean3(last), before = mean3(prior), fingerprints = memoryFingerprint({ ...data, events: e }, now), fast = fingerprints.filter((f) => f.ready && f.factor < 1).sort((a, b) => a.factor - b.factor)[0], evolution = policyEvolution({ ...data, events: e }, now);
  return {
    weekCount: last.length,
    days: new Set(last.map((e2) => localDay(new Date(e2.occurredAt)))).size,
    accuracy: last.length >= 5 ? current : null,
    change: last.length >= 5 && prior.length >= 5 ? current - before : null,
    weekly: weeklyLearningGpa(data, now),
    gpa: examGpa(data, now),
    method: evolution.winner ? "\u5DF2\u6709\u8DB3\u591F\u95F4\u9694\u8BB0\u5F55\uFF0C\u7EE7\u7EED\u91C7\u7528\u6BD4\u8F83\u4E2D\u8BC1\u636E\u66F4\u5F3A\u7684\u7B56\u7565\u3002" : fast ? fast.title + "\u7684\u9057\u5FD8\u8F83\u5FEB\uFF0C\u7F29\u77ED\u8BE5\u7C7B\u5185\u5BB9\u7684\u590D\u4E60\u95F4\u9694\u3002" : "\u7EE7\u7EED\u4E3B\u52A8\u56DE\u5FC6\u4E0E\u95F4\u9694\u9A8C\u8BC1\uFF1B\u8BC1\u636E\u4E0D\u8DB3\u65F6\u4FDD\u6301\u4FDD\u5B88\u5B89\u6392\u3002",
    methodEvidence: evolution.trials,
    methodSources: [
      "https://www.psychologicalscience.org/journals/psychological-science/j.1467-9280.2006.01693.x/",
      "https://www.nature.com/articles/s41539-020-00074-4"
    ]
  };
}
export {
  computeMastery as legacyComputeMastery,
  dailyStudyPlan as legacyDailyStudyPlan,
  studyAgenda as legacyStudyAgenda
};
