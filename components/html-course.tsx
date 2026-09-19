'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { buildCourseDocument, practiceEligibility } from '@/lib/course-html';
import type { Question } from '@/lib/model';
import { courseErrorMessage } from '@/lib/course-errors';
let fontPromise: Promise<string> | undefined;
function fontData() {
  return (fontPromise ??= fetch(
    new URL('fonts/noto-sc/noto-sc.woff2', document.baseURI),
  )
    .then((r) => {
      if (!r.ok) throw new Error('font');
      return r.arrayBuffer();
    })
    .then(
      (data) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = reject;
          reader.readAsDataURL(new Blob([data], { type: 'font/woff2' }));
        }),
    )
    .catch(() => {
      fontPromise = undefined;
      return '';
    }));
}
type Props = {
  html: string;
  title: string;
  checks: Question[];
  passed: string[];
  state?: Record<string, unknown>;
  locked?: boolean;
  preview?: boolean;
  freeForm?: boolean;
  onCheck: (q: Question, answer: string, at: number) => Promise<void>;
  onState: (state: Record<string, unknown>) => Promise<unknown>;
  onPractice: () => Promise<void>;
  onAsk: (text: string) => void;
};
export default function HtmlCourse(props: Props) {
  const frame = useRef<HTMLIFrameElement>(null),
    latest = useRef(props),
    started = useRef(Date.now()),
    queue = useRef(Promise.resolve());
  latest.current = props;
  const [channel] = useState(() => crypto.randomUUID()),
    [height, setHeight] = useState(760),
    [error, setError] = useState('');
  const document = useMemo(() => {
    try {
      return {
        html: buildCourseDocument(props.html, channel, true),
        error: '',
      };
    } catch (e) {
      return { html: '', error: courseErrorMessage(e) };
    }
  }, [props.html, channel]);
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      const m = event.data;
      if (
        event.source !== frame.current?.contentWindow ||
        m?.courseBridge !== 1 ||
        m.channel !== channel
      )
        return;
      if (m.method === 'resize') {
        if (Number.isFinite(m.height))
          setHeight(Math.max(640, Math.min(2600, m.height)));
        return;
      }
      if (m.method === 'error') {
        setError('课件的一段互动未能运行，可以在课程答疑中请求修复。');
        return;
      }
      if (typeof m.id !== 'string' || m.id.length > 100) return;
      const source = event.source as Window;
      queue.current = queue.current
        .catch(() => {})
        .then(async () => {
          try {
            const p = latest.current;
            const passed = () =>
              p.checks
                .map((q, i) => (p.passed.includes(q.id) ? i : -1))
                .filter((i) => i >= 0);
            let value: any;
            const eligible = () =>
              practiceEligibility(p.checks.length, passed(), p.freeForm);
            if (m.method === 'state')
              value = {
                checks: p.checks.map((q, index) => ({
                  index,
                  prompt: q.prompt,
                  options: q.options,
                })),
                passed: passed(),
                state: p.state ?? {},
                canPractice: eligible().allowed,
              };
            else if (m.method === 'eligibility') value = eligible();
            else if (m.method === 'check') {
              if (p.locked)
                throw new Error('当前为预览或正在保存，暂不记录作答');
              const { index, answer } = m.args ?? {};
              if (
                !Number.isInteger(index) ||
                typeof answer !== 'string' ||
                answer.length > 800
              )
                throw new Error('检验参数不正确');
              const q = p.checks[index];
              if (!q || !q.options?.includes(answer))
                throw new Error('检验答案不在有效选项中');
              if (!p.preview) await p.onCheck(q, answer, started.current);
              if (answer === q.answer && !p.passed.includes(q.id)) {
                p.passed = [...p.passed, q.id];
              }
              value = {
                correct: answer === q.answer,
                explanation: q.explanation,
                canPractice: eligible().allowed,
              };
            } else if (m.method === 'save') {
              if (p.preview || p.locked) throw new Error('预览不保存进度');
              const state = m.args?.state;
              if (
                !state ||
                typeof state !== 'object' ||
                Array.isArray(state) ||
                JSON.stringify(state).length > 16000
              )
                throw new Error('互动状态过大或格式不正确');
              await p.onState(state);
              value = { saved: true };
            } else if (m.method === 'practice') {
              if (p.preview || p.locked || !eligible().allowed)
                throw new Error('请先完成课件中的理解检验');
              await p.onPractice();
              value = { allowed: true };
            } else if (m.method === 'ask') {
              if (typeof m.args?.text !== 'string')
                throw new Error('问题内容不正确');
              p.onAsk(m.args.text.slice(0, 1800));
              value = { opened: true };
            } else throw new Error('不支持的学习接口');
            source.postMessage({ channel, id: m.id, value }, '*');
          } catch (e) {
            source.postMessage(
              {
                channel,
                id: m.id,
                error: e instanceof Error ? e.message : '学习接口暂未完成',
              },
              '*',
            );
          }
        });
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [channel]);
  return (
    <div className="html-course-surface">
      {(error || document.error) && (
        <p className="inline-hint" role="alert">
          {document.error || error}
        </p>
      )}
      {!document.error && (
        <iframe
          ref={frame}
          title={props.title + ' · 互动课件'}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          srcDoc={document.html}
          style={{ height }}
          onLoad={() => {
            void fontData().then((font) => {
              if (font)
                frame.current?.contentWindow?.postMessage(
                  { channel, font },
                  '*',
                );
            });
          }}
        />
      )}
    </div>
  );
}
