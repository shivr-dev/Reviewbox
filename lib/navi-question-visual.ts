import type { Question } from './model';
import { diagramSchema } from './diagram-spec';

export function originalNaviDiagram({ diagram, diagramChoice }: Question) {
  if (diagramChoice !== 'skip' && diagram &&
    (!('phase' in diagram) || !diagram.phase || diagram.phase === 'question')) return diagram;
}

export function questionHasOriginalVisual(question: Question) {
  return !!originalNaviDiagram(question) ||
    !!question.media?.some((item) => (item.purpose ?? 'question') === 'question');
}

/** A two-point sketch of stated observations, without inferring a speed or a motion curve. */
export function naviQuestionSketch(question: Question): Question['diagram'] {
  if (questionHasOriginalVisual(question) || !['physics', 'math', 'ce'].includes(question.subject)) return;
  const prompt = question.prompt.normalize('NFKC')
    .replace(/\\(?:mathrm|text)\{([a-z/]+)\}/gi, '$1').replace(/\\[,;!]|\$/g, '');
  const times = [...prompt.matchAll(/(\d+(?:\.\d+)?)\s*(秒钟?|分钟|小[时時]|seconds?|minutes?|hours?|s|min|h)(?![a-z\d/])/gi)];
  const distances = [...prompt.matchAll(/(\d+(?:\.\d+)?)\s*(千米|公里|厘米|米|kilometers?|centimeters?|meters?|km|cm|m)(?![a-z\d/])/gi)];
  if (times.length !== 1 || distances.length !== 1 || !/行[驶駛]|走了|跑了|路[程段]|移[动動]|travel|cover(?:ed|s)?|walk|ran|drove/i.test(prompt))
    return;
  if (/起始时间|出发时刻|返回|折返|往返|来回|來回|来往|來往|return|back and forth|round trip|[只每]秒/.test(prompt)) return;
  const [, timeText, timeUnit] = times[0];
  const [, distanceText, distanceUnit] = distances[0];
  const time = Number(timeText), distance = Number(distanceText);
  if (time <= 0 || distance <= 0 || distance > 10000) return;
  const parsed = diagramSchema.safeParse({
    type: 'semantic', kind: 'motion', mode: 'schematic', chart: 'position',
    positions: [
      { x: 0, time: 0, label: '0 ' + timeUnit + ' · 0 ' + distanceUnit },
      { x: distance, time, label: timeText + ' ' + timeUnit + ' · ' + distanceText + ' ' + distanceUnit },
    ],
  });
  if (parsed.success) return parsed.data;
}
