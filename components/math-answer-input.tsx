'use client';

import { createPortal } from 'react-dom';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown, Keyboard, Redo2, Undo2 } from 'lucide-react';
import type { MathfieldElement } from 'mathlive';
import { tr } from '@/lib/i18n';
import { assetPath } from '@/lib/runtime';
import { mathInputProblem, type MathAnswerFormat } from '@/lib/math-input-format';

const shortcuts = [
  ['分数', '\\frac{#0}{#?}'], ['根号', '\\sqrt{#0}'], ['指数', '{#0}^{#?}'],
  ['下标', '{#0}_{#?}'], ['绝对值', '\\left|#0\\right|'],
  ['方程组', '\\begin{cases}#0&#?\\\\#?&#?\\end{cases}'], ['单位', '\\mathrm{#0}'],
] as const;

type KeyboardView = { height: number; backdrop: HTMLElement | null };
let keyboardOwner: { field: MathfieldElement; reset: () => void; afterClose: (callback: () => void) => void } | undefined;
const animate = () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function MathAnswerInput({
  value, onChange, disabled = false, readOnly = false, placeholder, label,
}: { value: string; onChange: (v: string) => void; disabled?: boolean; readOnly?: boolean; placeholder?: string; label?: string }) {
  const fieldLabel = label ?? tr('study:math.fieldLabel');
  const fieldPlaceholder = placeholder ?? tr('study:math.placeholder');
  const host = useRef<HTMLDivElement>(null);
  const field = useRef<MathfieldElement | null>(null);
  const keyboardToggle = useRef<HTMLButtonElement>(null);
  const keyboardActions = useRef<{ toggle: () => void; close: () => void } | null>(null);
  const callback = useRef(onChange);
  const latest = useRef(value);
  const locked = useRef(disabled || readOnly);
  const [state, setState] = useState<'loading' | 'ready' | 'fallback'>('loading');
  const [problem, setProblem] = useState('');
  const [keyboardView, setKeyboardView] = useState<KeyboardView>();
  callback.current = onChange;
  latest.current = value;
  locked.current = disabled || readOnly;

  useEffect(() => {
    let cancelled = false;
    let cleanup = () => {};
    async function load() {
      const { MathfieldElement } = await import('mathlive');
      if (cancelled || !host.current) return;
      MathfieldElement.fontsDirectory = assetPath('vendor/mathlive/fonts');
      MathfieldElement.soundsDirectory = null;
      MathfieldElement.computeEngine = null;
      const mf = new MathfieldElement();
      field.current = mf;
      mf.setAttribute('aria-label', fieldLabel);
      mf.setAttribute('placeholder', fieldPlaceholder);
      mf.mathVirtualKeyboardPolicy = 'manual';
      mf.macros = {};
      mf.readOnly = locked.current;
      mf.value = mathInputProblem(latest.current) ? '' : latest.current;
      const mounted = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('公式编辑器挂载超时')), 2500);
        mf.addEventListener('mount', () => { clearTimeout(timer); resolve(); }, { once: true });
      });
      host.current.replaceChildren(mf);
      await mounted;
      if (cancelled) { mf.remove(); return; }
      mf.menuItems = [];

      const vk = window.mathVirtualKeyboard;
      const rootStyle = document.documentElement.style;
      const owner = {
        field: mf,
        reset,
        afterClose(callback: () => void) {
          afterClose = callback;
          closeKeyboard();
        },
      };
      let view: KeyboardView | undefined;
      let motion: Animation | undefined;
      let afterClose: (() => void) | undefined;
      let closing = false;
      let nativeHide = false;
      let nextFrame = 0;
      const stage = mf.closest<HTMLElement>('.guided-stage');
      const findBackdrop = () => document.querySelector<HTMLElement>('.ML__keyboard.is-visible > .MLK__backdrop');

      function reset() {
        cancelAnimationFrame(nextFrame);
        motion?.cancel();
        motion = undefined;
        closing = false;
        afterClose = undefined;
        view?.backdrop?.removeAttribute('data-rb-closing');
        view = undefined;
        stage?.style.removeProperty('--review-math-keyboard-scroll');
        setKeyboardView(undefined);
      }
      function release() {
        if (keyboardOwner !== owner) return;
        keyboardOwner = undefined;
        reset();
        rootStyle.removeProperty('--review-math-keyboard-height');
      }
      function syncKeyboard() {
        if (keyboardOwner !== owner) return;
        if (!vk.visible) { release(); return; }
        const backdrop = findBackdrop();
        const height = backdrop?.offsetHeight ?? vk.boundingRect.height;
        if (height === view?.height && backdrop === view.backdrop) return;
        view = { height, backdrop };
        setKeyboardView(view);
        rootStyle.setProperty('--review-math-keyboard-height', height + 'px');
        cancelAnimationFrame(nextFrame);
        const covered = () => Math.ceil(mf.getBoundingClientRect().bottom - (window.innerHeight - height - 14));
        if (stage && covered() > 0) {
          stage.style.setProperty('--review-math-keyboard-scroll', height + 'px');
          nextFrame = requestAnimationFrame(() => {
            const offset = covered();
            if (offset > 0) stage.scrollBy({ top: offset, behavior: 'instant' });
          });
        }
      }
      function claim() {
        if (keyboardOwner === owner) return;
        keyboardOwner?.reset();
        keyboardOwner = owner;
        if (vk.visible) syncKeyboard();
      }
      function finishClose(keepCallback = true) {
        const next = keepCallback ? afterClose : undefined;
        nativeHide = true;
        vk.hide({ animate: false });
        nativeHide = false;
        release();
        next?.();
      }
      // MathLive removes its keyboard immediately on hide. Run the exit on
      // the same panel as the keys, then let MathLive remove it.
      function playMotion(open: boolean, fresh = false) {
        const backdrop = findBackdrop();
        if (!backdrop || !animate()) {
          if (!open) finishClose();
          return;
        }
        closing = !open;
        backdrop.toggleAttribute('data-rb-closing', closing);
        const current = getComputedStyle(backdrop);
        const from = fresh ? { translate: '0 36px', opacity: 0 } :
          { translate: current.translate, opacity: Number(current.opacity) };
        motion?.cancel();
        const next = backdrop.animate([from, open ? { translate: '0 0', opacity: 1 } : { translate: '0 36px', opacity: 0 }], {
          duration: open ? 310 : 240, easing: open ? 'cubic-bezier(.2,.65,.3,1)' : 'cubic-bezier(.38,0,.7,.62)',
          fill: 'both',
        });
        motion = next;
        next.onfinish = () => {
          if (motion !== next) return;
          if (!open) finishClose();
          else { next.cancel(); motion = undefined; }
        };
      }
      function closeKeyboard(immediate = false) {
        if (keyboardOwner !== owner) return;
        if (immediate) finishClose(false);
        else if (!closing) playMotion(false);
      }
      keyboardActions.current = {
        toggle() {
          if (locked.current) return;
          if (vk.visible && keyboardOwner === owner) {
            if (closing) { afterClose = undefined; mf.focus(); playMotion(true); }
            else closeKeyboard();
            return;
          }
          const fresh = !vk.visible;
          mf.focus();
          claim();
          vk.show({ animate: false });
          syncKeyboard();
          if (fresh && vk.visible) playMotion(true, true);
        },
        close: () => closeKeyboard(true),
      };
      const beforeToggle = (event: Event) => {
        if (nativeHide || keyboardOwner !== owner || !animate() || !findBackdrop()) return;
        if ((event as CustomEvent<{ visible: boolean }>).detail?.visible === false) {
          event.preventDefault();
          closeKeyboard();
        }
      };
      const focus = () => { if (vk.visible && !locked.current) claim(); };
      const escape = (event: KeyboardEvent) => {
        if (event.key !== 'Escape' || !vk.visible || keyboardOwner !== owner) return;
        event.preventDefault();
        closeKeyboard();
        event.stopPropagation();
      };
      const input = () => {
        const error = mathInputProblem(mf.value);
        if (error) {
          setProblem(error);
          mf.setValue(latest.current, { silenceNotifications: true });
          return;
        }
        setProblem(mf.errors.length ? '公式尚未完整，请检查括号、分母和占位符' : '');
        callback.current(mf.value);
      };
      const paste = (event: ClipboardEvent) => {
        const error = mathInputProblem(event.clipboardData?.getData('text/plain') ?? '');
        if (error) { event.preventDefault(); setProblem(error); }
      };
      vk.addEventListener('geometrychange', syncKeyboard);
      vk.addEventListener('virtual-keyboard-toggle', syncKeyboard);
      vk.addEventListener('before-virtual-keyboard-toggle', beforeToggle);
      mf.addEventListener('focus', focus);
      window.addEventListener('keydown', escape, true);
      mf.addEventListener('paste', paste);
      mf.addEventListener('input', input);
      setState('ready');
      cleanup = () => {
        vk.removeEventListener('geometrychange', syncKeyboard);
        vk.removeEventListener('virtual-keyboard-toggle', syncKeyboard);
        vk.removeEventListener('before-virtual-keyboard-toggle', beforeToggle);
        mf.removeEventListener('focus', focus);
        window.removeEventListener('keydown', escape, true);
        mf.removeEventListener('paste', paste);
        mf.removeEventListener('input', input);
        closeKeyboard(true);
        mf.remove();
        field.current = null;
        keyboardActions.current = null;
      };
    }
    load().catch(error => {
      if (!cancelled) {
        setProblem(error instanceof Error ? error.message : '数学输入加载失败');
        setState('fallback');
      }
    });
    return () => { cancelled = true; cleanup(); };
  }, [fieldLabel, fieldPlaceholder]);

  useEffect(() => {
    const mf = field.current;
    if (!mf) return;
    mf.readOnly = disabled || readOnly;
    if (mf.readOnly) keyboardActions.current?.close();
    if (mf.value !== value && !mathInputProblem(value)) mf.setValue(value, { silenceNotifications: true });
  }, [value, disabled, readOnly]);

  const unavailable = disabled || readOnly || state !== 'ready';
  return <div className="math-answer-input">
    {state !== 'fallback' && <div className="math-editor-frame">
      <div ref={host} className="mathlive-host" />
      {state === 'loading' && <span className="math-editor-loading" role="status">{tr('study:数学输入加载中…')}</span>}
    </div>}
    {state === 'fallback' && <>
      <p role="status">{tr('study:数学输入暂不可用，可继续输入文字或 LaTeX。')}</p>
      <textarea aria-label={fieldLabel} value={value} disabled={disabled} readOnly={readOnly} placeholder={fieldPlaceholder}
        onChange={event => onChange(event.target.value)} maxLength={4000} />
    </>}
    {state !== 'fallback' && <div className="math-input-tools">
      <div className="math-shortcuts">
        {shortcuts.map(([name, latex]) => <button type="button" key={name} disabled={unavailable}
          onClick={() => { field.current?.focus(); field.current?.insert(latex); }}>{tr('study:math.' + name)}</button>)}
      </div>
      <div className="math-edit-tools">
        {([['undo', '撤销', Undo2], ['redo', '重做', Redo2]] as const).map(([command, title, Icon]) =>
          <button type="button" key={command} aria-label={tr('study:' + title)} title={tr('study:' + title)}
            disabled={unavailable} onClick={() => field.current?.executeCommand(command)}><Icon size={17} /></button>)}
        <button ref={keyboardToggle} type="button" className="math-keyboard-toggle" disabled={unavailable}
          aria-expanded={!!keyboardView?.height} onClick={() => keyboardActions.current?.toggle()}>
          <Keyboard size={17} />{tr('study:数学键盘')}
        </button>
      </div>
    </div>}
    {problem && <p className="math-input-problem" role="status">{problem}</p>}
    {!!keyboardView?.height && createPortal(<div className={'math-keyboard-header' + (keyboardView.backdrop ? '' : ' math-keyboard-header-detached')}>
      <span><Keyboard size={17} />{tr('study:数学键盘')}</span>
      <button type="button" className="math-keyboard-dismiss" aria-label={tr('study:收起数学键盘')} title={tr('study:收起数学键盘')}
        onClick={() => { keyboardActions.current?.toggle(); keyboardToggle.current?.focus({ preventScroll: true }); }}>
        <ChevronDown size={20} />
      </button>
    </div>, keyboardView.backdrop ?? document.body)}
  </div>;
}
export default function MathAnswerComposer({
  value, format, onChange, onFormatChange, disabled = false, defaultMixed = false, name,
}: {
  value: string; format: MathAnswerFormat; onChange: (value: string) => void;
  onFormatChange: (format: MathAnswerFormat) => void; disabled?: boolean; defaultMixed?: boolean; name?: string;
}) {
  const [fragment, setFragment] = useState('');
  const composer = useRef<HTMLDivElement>(null);
  const shell = useRef<HTMLDivElement>(null);
  const editor = useRef<HTMLDivElement>(null);
  const mode = useRef({ format, disabled, onFormatChange });
  mode.current = { format, disabled, onFormatChange };
  const layout = useRef({ format, height: 0, resize: undefined as Animation | undefined, reveal: undefined as Animation | undefined });

  useLayoutEffect(() => {
    const box = shell.current;
    const content = editor.current;
    if (!box || !content) return;
    const memory = layout.current;
    const switching = memory.format !== format && animate();
    memory.format = format;
    function measure(initial = false) {
      if (!box || !content) return;
      const next = content.getBoundingClientRect().height;
      const previous = memory.resize ? box.getBoundingClientRect().height : memory.height;
      const targetChanged = Math.abs(next - memory.height) > 1;
      memory.height = next;
      if ((!initial && !memory.resize) || !targetChanged || !previous) return;
      memory.resize?.cancel();
      box.setAttribute('data-resizing', '');
      const resize = box.animate([{ height: previous + 'px' }, { height: next + 'px' }], {
        duration: 290, easing: 'cubic-bezier(.2,.65,.3,1)', fill: 'both',
      });
      memory.resize = resize;
      resize.onfinish = () => {
        if (memory.resize !== resize) return;
        resize.cancel();
        memory.resize = undefined;
        box.removeAttribute('data-resizing');
      };
    }
    if (switching) {
      memory.reveal?.cancel();
      memory.reveal = content.animate([{ opacity: .42, translate: '0 4px' }, { opacity: 1, translate: '0 0' }], {
        duration: 240, easing: 'cubic-bezier(.2,.65,.3,1)',
      });
    }
    measure(switching);
    const observer = new ResizeObserver(() => measure());
    observer.observe(content);
    return () => observer.disconnect();
  }, [format]);

  function chooseFormat(next: MathAnswerFormat) {
    const change = () => {
      const current = mode.current;
      if (!current.disabled && next !== current.format) current.onFormatChange(next);
    };
    if (keyboardOwner && composer.current?.contains(keyboardOwner.field)) {
      if (next !== format) keyboardOwner.afterClose(change);
    } else change();
  }

  return <div className="math-answer-composer" ref={composer}>
    <div className="math-format-picker" role="group" aria-label={tr('study:答案输入方式')}>
      {([['text', '文字'], ['latex', '公式'], ['mixed', '文字与公式']] as const).map(([id, title]) =>
        <button type="button" key={id} aria-pressed={format === id} disabled={disabled} onClick={() => chooseFormat(id)}>
          {tr('study:' + title)}
        </button>)}
    </div>
    {name && <input type="hidden" name={name} value={value} />}
    <input type="hidden" name="answerFormat" value={format} />
    <div className="math-mode-body" ref={shell}>
      <div className="math-mode-content" ref={editor}>
        {format === 'latex' ? <MathAnswerInput value={value} onChange={onChange} disabled={disabled} /> :
          <textarea aria-label={tr('study:你的回答')} value={value} onChange={event => onChange(event.target.value)}
            disabled={disabled} rows={defaultMixed ? 6 : 3} maxLength={16000}
            placeholder={format === 'mixed' ? tr('study:用文字说明过程，公式可在下方输入后插入。') : tr('study:输入答案；原有文字不会被自动转换。')} />}
        {format === 'mixed' && <div className="mixed-math-fragment">
          <MathAnswerInput value={fragment} onChange={setFragment} disabled={disabled} label={tr('study:插入到回答中的公式')} />
          <button type="button" disabled={disabled || !fragment.trim() || !!mathInputProblem(fragment)} onClick={() => {
            onChange(value + (value ? ' ' : '') + '$' + fragment + '$');
            setFragment('');
          }}>{tr('study:插入公式到回答')}</button>
        </div>}
      </div>
    </div>
  </div>;
}

