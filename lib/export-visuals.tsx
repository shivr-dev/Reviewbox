import { serializePublicationSvg } from './math-svg';
import { visiblePhase } from './diagram-registry';
import { createRoot } from 'react-dom/client';
import QuestionVisual from '@/components/question-visual';
import type { Question } from './model';
import type { ExportImage } from './export-docx';
async function pixels(src: string) {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.decoding = 'sync';
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () =>
      reject(new Error('题图无法读取，请检查图片来源或跨域权限'));
    image.src = src;
  });
  const canvas = document.createElement('canvas'),
    scale = Math.min(
      2,
      2000 / Math.max(image.naturalWidth, image.naturalHeight),
    );
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('浏览器不能导出图片');
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('图片导出失败'))),
      'image/png',
    ),
  );
  return {
    bytes: new Uint8Array(await blob.arrayBuffer()),
    width: image.naturalWidth,
    height: image.naturalHeight,
  };
}
/** Render the same question/solution component used in StudyView, then serialize
 * its existing artwork. No new drawing engine or AI generation is involved. */
export async function captureQuestionVisuals(
  question: Question,
  stage: 'question' | 'solution',
  signal: AbortSignal,
): Promise<ExportImage[]> {
  const hidden =
    question.diagram?.type === 'semantic' &&
    !visiblePhase(question.diagram.phase, stage);
  if (
    (!question.diagram || hidden) &&
    !question.media?.some((m) => (m.purpose ?? 'question') === stage)
  )
    return [];
  const host = document.createElement('div');
  host.style.cssText =
    'position:fixed;left:-10000px;top:0;width:600px;pointer-events:none;background:white;';
  host.setAttribute('aria-hidden', 'true');
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    root.render(
      <div data-export-mounted>
        <QuestionVisual
          question={question}
          solution={stage === 'solution'}
          stage={stage}
        />
      </div>,
    );
    const end = Date.now() + 25000;
    while (true) {
      if (signal.aborted) throw new Error('导出已取消');
      if (Date.now() > end)
        throw new Error('题图加载超时，请先在学习页面打开题图后重试');
      const error = host.querySelector('[role="alert"]');
      if (error) throw new Error(error.textContent ?? '题图未能加载');
      host.querySelectorAll('img').forEach((i) => {
        i.loading = 'eager';
      });
      if (
        host.querySelector('[data-export-mounted]') &&
        !host.querySelector('[aria-busy="true"]') &&
        (host.querySelector('svg') || host.querySelector('img')) &&
        [...host.querySelectorAll('img')].every(
          (i) => i.complete && i.naturalWidth,
        )
      )
        break;
      await new Promise((r) => setTimeout(r, 80));
    }
    await document.fonts.ready;
    const result: ExportImage[] = [];
    for (const svg of host.querySelectorAll('svg')) {
      if (svg.closest('button')) continue;
      if (svg.querySelector('script'))
        throw new Error('此题图不能安全导出为 Word 矢量图');
      for (const foreign of svg.querySelectorAll('foreignObject'))
        if (
          (foreign.textContent ?? '').trim() ||
          foreign.querySelector('img,canvas,video,iframe')
        )
          throw new Error('题图含有不能转换的嵌入内容，请使用纯矢量题图');
      const clone = svg.cloneNode(true) as SVGSVGElement;
      const vb = (clone.getAttribute('viewBox') ?? '0 0 600 380')
          .split(/[ ,]+/)
          .map(Number),
        width = vb[2] || 600,
        height = vb[3] || 380;
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      clone.setAttribute('width', String(width));
      clone.setAttribute('height', String(height));
      const markup = serializePublicationSvg(clone),
        url = URL.createObjectURL(
          new Blob([markup], { type: 'image/svg+xml' }),
        );
      try {
        const png = await pixels(url);
        result.push({
          type: 'svg',
          data: new TextEncoder().encode(markup),
          fallback: png.bytes,
          width,
          height,
          alt:
            question.diagram?.type === 'semantic'
              ? (question.diagram.caption ?? '题图')
              : '题图',
          stage,
        });
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    for (const image of host.querySelectorAll('img')) {
      const png = await pixels(image.currentSrc || image.src);
      result.push({
        type: 'png',
        data: png.bytes,
        width: png.width,
        height: png.height,
        alt: image.alt,
        stage,
      });
    }
    return result;
  } finally {
    root.unmount();
    host.remove();
  }
}
