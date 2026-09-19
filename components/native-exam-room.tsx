'use client';
import { useEffect, useRef, useState } from 'react';
import { useReview } from './review-context';
import { currentNamespace, put, saveRecords } from '@/lib/store';
import { applyNativeAnswers, nativeExamPackage } from '@/lib/exam-native';
import type { ExamPaper, ExamRun } from '@/lib/exam-model';

export default function NativeExamRoom({
  run,
  paper,
}: {
  run: ExamRun;
  paper: ExamPaper;
}) {
  const { data, refresh, navigate } = useReview();
  const frame = useRef<HTMLIFrameElement>(null),
    current = useRef(run),
    ns = useRef(currentNamespace()),
    writes = useRef(Promise.resolve());
  const [channel] = useState(() => crypto.randomUUID()),
    [error, setError] = useState('');
  useEffect(() => {
    const pack = nativeExamPackage(
      paper,
      data.questions,
      data.jobs ?? [],
      'Test Taker',
    );
    let active = true;
    const enqueue = (job: () => Promise<void>) => {
      writes.current = writes.current
        .then(async () => {
          if (currentNamespace() !== ns.current)
            throw Error('账户已切换，请返回 CE。');
          await job();
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
      return writes.current;
    };
    const receive = (event: MessageEvent) => {
      if (
        event.source !== frame.current?.contentWindow ||
        event.origin !== location.origin ||
        event.data?.channel !== channel
      )
        return;
      const message = event.data;
      if (message.type === 'exam-ready')
        frame.current?.contentWindow?.postMessage(
          {
            type: 'exam-init',
            channel,
            pack,
            snapshot: current.current.native,
          },
          location.origin,
        );
      if (message.type === 'exam-error')
        setError(String(message.message).slice(0, 400));
      if (message.type === 'exam-save' || message.type === 'exam-exit') {
        if (
          !message.snapshot ||
          JSON.stringify(message.snapshot).length > 1500000
        ) {
          setError('考试记录过大，暂未保存。');
          return;
        }
        const next = applyNativeAnswers(
          current.current,
          paper,
          data.questions,
          message.snapshot,
        );
        if (message.type === 'exam-exit' && next.status === 'complete')
          next.native.showReport = true;
        current.current = next;
        void enqueue(async () => {
          await put('job', next, next.id, false, ns.current);
          if (message.type === 'exam-exit') {
            await refresh();
            if (next.status !== 'complete') navigate('subjects', 'ce');
          }
        });
      }
      if (message.type === 'exam-recording')
        void enqueue(async () => {
          try {
            if (!(message.blob instanceof Blob) || message.blob.size > 15000000)
              throw Error('录音文件无效或超过 15 MB。');
            const bytes = new Uint8Array(await message.blob.arrayBuffer());
            let binary = '';
            for (const byte of bytes) binary += String.fromCharCode(byte);
            const b64 = btoa(binary),
              id = 'exam-recording:' + run.id + ':' + String(message.key),
              parts: string[] = [],
              payloads: any[] = [];
            for (let i = 0; i < b64.length; i += 700000) {
              const part = id + ':' + parts.length;
              parts.push(part);
              payloads.push({
                id: part,
                kind: 'exam-asset-chunk',
                data: b64.slice(i, i + 700000),
              });
            }
            payloads.push({
              id,
              kind: 'exam-asset',
              mime: message.blob.type,
              parts,
            });
            await saveRecords(
              payloads.map((payload) => ({
                id: payload.id,
                kind: 'job' as const,
                payload,
                updated_at: new Date().toISOString(),
                deleted: false,
              })),
              true,
              ns.current,
            );
            frame.current?.contentWindow?.postMessage(
              { type: 'exam-recording-saved', channel, id: message.id },
              location.origin,
            );
          } catch (e) {
            frame.current?.contentWindow?.postMessage(
              {
                type: 'exam-recording-saved',
                channel,
                id: message.id,
                error: e instanceof Error ? e.message : '录音未能保存',
              },
              location.origin,
            );
            throw e;
          }
        });
    };
    window.addEventListener('message', receive);
    return () => {
      active = false;
      window.removeEventListener('message', receive);
    };
  }, [channel]);
  return (
    <main className="native-exam-shell">
      {error && (
        <div className="native-exam-error" role="alert">
          {error}
          <button onClick={() => navigate('subjects', 'ce')}>返回 CE</button>
        </div>
      )}
      <iframe
        ref={frame}
        title={paper.exam + ' 考试模拟器'}
        src={'./exam-simulator/index.html?channel=' + channel}
        allow="microphone; autoplay; clipboard-write"
      />
      <button
        className="native-exam-exit"
        onClick={() =>
          frame.current?.contentWindow?.postMessage(
            { type: 'exam-request-exit', channel },
            location.origin,
          )
        }
      >
        保存并返回
      </button>
    </main>
  );
}
