'use client';
import { useEffect, useRef, useState } from 'react';
import { useReview } from './review-context';
import { currentNamespace, put } from '@/lib/store';
import { apiFetch } from '@/lib/runtime';
import { extractFile } from '@/lib/importer';
import {
  validateProcessResult,
  type ProcessEvidence,
} from '@/lib/process-diagnosis';
import { uid, type Question } from '@/lib/model';
import MathText from './math-text';
export default function ProcessNotebook({
  question: q,
  sessionId,
  revealed,
  onAssistance,
  onClose,
}: {
  question: Question;
  sessionId: string;
  revealed: boolean;
  onAssistance: () => void;
  onClose: () => void;
}) {
  const { data, aiReady, refresh } = useReview();
  const id = 'process-draft:' + sessionId + ':' + q.id;
  const previous = data.jobs?.find((j) => j.id === id);
  const [text, setText] = useState(previous?.text ?? ''),
    [image, setImage] = useState(previous?.image ?? ''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState<ProcessEvidence | undefined>(
      data.jobs
        ?.filter(
          (j) =>
            j.kind === 'process-evidence' &&
            j.questionId === q.id &&
            j.sessionId === sessionId,
        )
        .at(-1),
    ),
    [confirmed, setConfirmed] = useState(!previous?.image);
  const canvas = useRef<HTMLCanvasElement>(null),
    drawing = useRef(false),
    ns = useRef(currentNamespace()),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    writes = useRef(Promise.resolve()),
    latest = useRef({
      text,
      image,
      afterReveal: previous?.afterReveal ?? revealed,
    }),
    lock = useRef(false),
    file = useRef<HTMLInputElement>(null);
  const persist = () => {
    const value = {
      id,
      kind: 'process-draft',
      questionId: q.id,
      sessionId,
      ...latest.current,
    };
    writes.current = writes.current
      .catch(() => {})
      .then(async () => {
        await put('job', value, id, false, ns.current);
      })
      .catch(() => setError('草稿未能保存，请检查设备存储'));
    return writes.current;
  };
  const update = (next: { text?: string; image?: string }) => {
    latest.current = {
      ...latest.current,
      ...next,
      afterReveal: latest.current.afterReveal || revealed,
    };
    setText(latest.current.text);
    setImage(latest.current.image);
    setResult(undefined);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void persist(), 500);
  };
  useEffect(() => {
    const hide = () => void persist();
    window.addEventListener('pagehide', hide);
    return () => {
      window.removeEventListener('pagehide', hide);
      if (timer.current) clearTimeout(timer.current);
      void persist();
    };
  }, []);
  useEffect(() => {
    const c = canvas.current,
      ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    if (image) {
      let alive = true;
      const img = new Image();
      img.onload = () => {
        if (alive) ctx.drawImage(img, 0, 0, c.width, c.height);
      };
      img.src = image;
      return () => {
        alive = false;
      };
    }
  }, [image]);
  async function ocr(input: File) {
    setBusy(true);
    setError('');
    try {
      const parsed = await extractFile(input);
      if (currentNamespace() !== ns.current) throw new Error('账户已切换');
      update({ text: parsed.text ?? '' });
      setConfirmed(false);
      if (!parsed.text?.trim())
        setError('没有识别到清晰文字，请手动填写步骤；手写公式尤其需要校对。');
    } catch (e) {
      setError(e instanceof Error ? e.message : '识别未完成');
    } finally {
      setBusy(false);
    }
  }
  async function diagnose() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await persist();
      if (currentNamespace() !== ns.current) throw new Error('账户已切换');
      const steps = text
        .split('\n')
        .map((s: string) => s.trim())
        .filter(Boolean);
      if (!steps.length || steps.length > 25)
        throw new Error('请填写 1–25 个步骤，每行一步');
      const response = await apiFetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'diagnose-process',
          question: q,
          steps,
        }),
        signal: AbortSignal.timeout(65000),
      });
      const v = (await response.json()) as any;
      if (!response.ok) throw new Error(v.error || '诊断未完成');
      const evidence: ProcessEvidence = {
        id: 'process-evidence:' + uid(),
        kind: 'process-evidence',
        questionId: q.id,
        questionVersion: q.version,
        sessionId,
        steps,
        result: validateProcessResult(v.diagnosis, steps),
        at: new Date().toISOString(),
        afterReveal: latest.current.afterReveal,
      };
      if (currentNamespace() !== ns.current)
        throw new Error('账户已切换，诊断未保存');
      await put('job', evidence, evidence.id, false, ns.current);
      setResult(evidence);
      if (!revealed) onAssistance();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : '诊断未完成，草稿已保留');
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  return (
    <aside className="process-notebook" aria-label="草稿过程诊断">
      <div className="section-head">
        <h3>草稿与分步作答</h3>
        <button
          className="quiet"
          onClick={() => {
            void persist();
            onClose();
          }}
        >
          关闭
        </button>
      </div>
      <p className="muted">
        可只写草稿，也可选择分析步骤。分析不自动评分；揭晓前获得诊断建议会记录为使用提示。
      </p>
      <canvas
        ref={canvas}
        width={800}
        height={320}
        aria-label="手写草稿"
        onPointerDown={(e) => {
          if (busy) return;
          drawing.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          const r = e.currentTarget.getBoundingClientRect(),
            ctx = e.currentTarget.getContext('2d');
          ctx?.beginPath();
          ctx?.moveTo(
            ((e.clientX - r.left) * 800) / r.width,
            ((e.clientY - r.top) * 320) / r.height,
          );
          if (ctx) {
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            ctx.strokeStyle = '#38342f';
          }
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const r = e.currentTarget.getBoundingClientRect(),
            ctx = e.currentTarget.getContext('2d');
          ctx?.lineTo(
            ((e.clientX - r.left) * 800) / r.width,
            ((e.clientY - r.top) * 320) / r.height,
          );
          ctx?.stroke();
        }}
        onPointerUp={() => {
          drawing.current = false;
          update({ image: canvas.current!.toDataURL('image/png') });
          setConfirmed(false);
        }}
        onPointerCancel={() => {
          drawing.current = false;
          if (canvas.current)
            update({ image: canvas.current.toDataURL('image/png') });
        }}
      />
      <div className="button-row">
        <button
          className="quiet"
          disabled={busy}
          onClick={() => {
            const ctx = canvas.current?.getContext('2d');
            if (ctx) {
              ctx.fillStyle = '#fff';
              ctx.fillRect(0, 0, 800, 320);
            }
            update({ image: '' });
            setConfirmed(true);
          }}
        >
          清空手写
        </button>
        <button
          className="secondary"
          disabled={busy || !image}
          onClick={() =>
            canvas.current?.toBlob((blob) => {
              if (blob)
                void ocr(new File([blob], '草稿.png', { type: 'image/png' }));
            })
          }
        >
          本地识别草稿
        </button>
        <button
          className="quiet"
          disabled={busy}
          onClick={() => file.current?.click()}
        >
          导入草稿照片
        </button>
      </div>
      <input
        ref={file}
        hidden
        type="file"
        accept="image/*"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) {
            const reader = new FileReader();
            reader.onload = () => update({ image: String(reader.result) });
            reader.readAsDataURL(f);
            void ocr(f);
          }
          e.target.value = '';
        }}
      />
      <label>
        实际解题步骤（每行一步）
        <textarea
          disabled={busy}
          maxLength={20000}
          rows={6}
          value={text}
          onChange={(e) => {
            update({ text: e.target.value });
          }}
          placeholder="1. 列出已知条件\n2. 建立关系式\n3. 逐步计算或推导"
        />
      </label>
      {image && (
        <label className="quality-check">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          已对照草稿校对文字、公式和步骤顺序
        </label>
      )}
      <button
        className="secondary"
        disabled={
          busy ||
          !text.trim() ||
          !confirmed ||
          !aiReady ||
          q.reviewStatus === 'paused'
        }
        onClick={() => void diagnose()}
      >
        {busy ? '正在处理…' : '分析首个出错步骤'}
      </button>
      <small className="muted">
        识别在本地进行；点击分析才调用 AI，使用现有额度。
      </small>
      {error && <p role="alert">{error}</p>}
      {result && (
        <article className="process-result">
          <b>
            {result.result.firstStep === null
              ? '过程分析'
              : '第 ' +
                (result.result.firstStep + 1) +
                ' 步 · ' +
                (result.result.status === 'gap'
                  ? '需要补充依据'
                  : '首个可能出错位置')}
          </b>
          {result.result.quote && (
            <blockquote>
              <MathText>{result.result.quote}</MathText>
            </blockquote>
          )}
          <p>
            <MathText>{result.result.explanation}</MathText>
          </p>
          <p>
            <MathText>{result.result.suggestion}</MathText>
          </p>
          <small className="muted">
            {result.result.status === 'uncertain'
              ? '证据不足，未作能力归因。'
              : result.afterReveal
                ? '揭晓后补充的步骤，仅供学习参考。'
                : '以实际步骤为依据；结论仍需结合后续表现。'}
          </small>
        </article>
      )}
    </aside>
  );
}
