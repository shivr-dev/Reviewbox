"use client";

import { useEffect, useId, useRef } from "react";

/**
 * Navi 01 — Soft Magnetic Motion
 * Original inline SVG + tiny requestAnimationFrame spring engine.
 * Zero image, video, network, WebGL, or animation-library dependencies.
 *
 * This is the selected Folio / Soft Magnetic concept. Do not replace with
 * Magnetic 2.0 hard-edged internal polygons or the earlier split-body versions.
 */
export type NaviMotionState =
  | "idle"
  | "thinking"
  | "explaining"
  | "guiding"
  | "success"
  | "error"
  | "sleeping";

export interface NaviAvatarProps {
  state?: NaviMotionState;
  size?: number | string;
  intensity?: number; // 0–1, default .72
  paused?: boolean;
  /** Increment to replay the current one-shot cycle from its beginning. */
  replayKey?: number;
  /** Optional gaze target, normalized to [-1,1]. */
  target?: { x: number; y: number } | null;
  className?: string;
  label?: string | null;
}

type SpringValue = { x: number; v: number };

type Config = {
  state: NaviMotionState;
  intensity: number;
  paused: boolean;
  replayKey: number;
  target: { x: number; y: number } | null;
};

const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const trans = (x: number, y: number) => `translate(${x.toFixed(2)} ${y.toFixed(2)})`;

export default function NaviAvatar({
  state = "idle",
  size = 120,
  intensity = 0.72,
  paused = false,
  replayKey = 0,
  target = null,
  className,
  label = "Navi 学习助手",
}: NaviAvatarProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const id = useId().replace(/:/g, "_");
  const configRef = useRef<Config>({ state, intensity, paused, replayKey, target });
  const runtimeRef = useRef<{
    start: () => void;
    stop: () => void;
    reset: () => void;
  } | null>(null);
  const lastStateRef = useRef(state);
  const lastReplayRef = useRef(replayKey);

  useEffect(() => {
    const element = svgRef.current;
    if (!element || typeof window.requestAnimationFrame !== "function") return;
    const root: SVGSVGElement = element;
    const by = <T extends Element>(name: string) =>
      root.querySelector<T>(`[data-navi="${name}"]`);
    const el = {
      body: by<SVGGElement>("body"),
      fin: by<SVGGElement>("fin"),
      a: by<SVGGElement>("a"),
      b: by<SVGGElement>("b"),
      c: by<SVGGElement>("c"),
      pupil: by<SVGGElement>("pupil"),
      sensor: by<SVGGElement>("sensor"),
      shadow: by<SVGEllipseElement>("shadow"),
      contact: by<SVGCircleElement>("contact"),
    };
    if (Object.values(el).some((v) => !v)) return;

    const physics: Record<string, SpringValue> = {};
    let raf = 0;
    let last: number | null = null;
    let clock = 0;
    let visible = true;
    let pointer = { x: 0, y: 0 };
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const spring = (key: string, goal: number, dt: number, hz = 2.4, damping = 0.78) => {
      const p = physics[key] ?? (physics[key] = { x: 0, v: 0 });
      const w = 2 * Math.PI * hz;
      p.v += (w * w * (goal - p.x) - 2 * damping * w * p.v) * dt;
      p.x += p.v * dt;
      return p.x;
    };
    const sp = spring;

    function applyStatic() {
      for (const key of ["body", "a", "b", "c", "pupil", "contact"]) {
        el[key as "body" | "a" | "b" | "c" | "pupil" | "contact"]?.removeAttribute("transform");
      }
      el.fin?.setAttribute("transform", "translate(285 168)");
      el.sensor?.setAttribute("transform", "translate(355 239)");
      el.contact?.setAttribute("opacity", "0");
      el.shadow?.setAttribute("rx", "77");
      el.shadow?.setAttribute("opacity", ".55");
    }

    function draw(now: number) {
      raf = 0;
      const cfg = configRef.current;
      if (
        cfg.paused || cfg.state === "sleeping" ||
        media?.matches || document.hidden || !visible
      ) return;
      if (last === null) last = now;
      const dt = Math.min(0.032, Math.max(0, (now - last) / 1000));
      last = now;
      clock += dt;
      const t = clock;
      const mode = cfg.state;
      const amp = clamp(cfg.intensity, 0, 1);
      let pulse = 0;
      let burst = 0;
      let recoil = 0;
      let explanation = 0;
      let guide = 0;

      if (mode === "thinking") {
        const q = (t % 5.6) / 5.6;
        pulse = smooth(.09, .36, q) * (1 - smooth(.51, .61, q));
      } else if (mode === "guiding") {
        const q = (t % 5) / 5;
        guide = smooth(.10, .32, q) * (1 - smooth(.60, .77, q));
        pulse = .55 * guide;
      } else if (mode === "explaining") {
        explanation = .5 + .5 * Math.sin(t * 1.3);
      } else if (mode === "success") {
        const q = Math.min(t / 1.5, 1); // once only, then settled
        burst = smooth(.10, .27, q) * (1 - smooth(.45, .62, q));
      } else if (mode === "error") {
        const q = Math.min(t / 1.1, 1); // brief recoil, not a shake
        recoil = smooth(.08, .22, q) * (1 - smooth(.42, .68, q));
      }

      const breath = Math.sin(t * 1.3) * (mode === "idle" ? 1.9 : 1.1);
      const bx = sp("bodyX", guide * 3 + breath * .2 - recoil * 2, dt, 1.95, .82);
      const by = sp("bodyY", -pulse * 2.4 - burst * 5 - breath + recoil * 3, dt, 2.1, .8);
      const br = sp("bodyR", guide * 2 - burst * 2 - recoil * 3, dt, 2.1, .8);
      el.body!.setAttribute("transform", `${trans(bx, by)} rotate(${br.toFixed(2)} 233 183)`);

      // Soft interior surfaces remain clipped INSIDE the intact body shell.
      // Small offset curves are intentionally asynchronous (not snapping blocks).
      const ax = sp("ax", amp * (7 * guide + 12 * pulse + 8 * burst), dt, 2.45, .73);
      const ay = sp("ay", amp * (-9 * pulse - 7 * burst), dt, 2.3, .72);
      const vx = sp("bx", amp * (-12 * pulse - 8 * burst - 2 * recoil), dt, 2.1, .75);
      const vy = sp("by", amp * (9 * pulse + 5 * burst + 5 * recoil), dt, 2.15, .77);
      const cx = sp("cx", amp * (4 * pulse - 4 * burst), dt, 1.85, .81);
      const cy = sp("cy", amp * (-6 * pulse + 6 * burst), dt, 2.05, .8);
      const ar = sp("ar", -4 * pulse * amp, dt, 2.2, .8);
      const vr = sp("vr", 5 * pulse * amp, dt, 2, .79);
      el.a!.setAttribute("transform", `${trans(ax, ay)} rotate(${ar.toFixed(2)})`);
      el.b!.setAttribute("transform", `${trans(vx, vy)} rotate(${vr.toFixed(2)})`);
      el.c!.setAttribute("transform", trans(cx, cy));

      const fr = sp("finR", -12 * pulse * amp - 15 * burst * amp - 5 * guide + breath * .55 + 4 * recoil + 2 * explanation, dt, 2.4, .7);
      const fx = sp("finX", 3 * pulse * amp, dt, 2.1, .73);
      const fy = sp("finY", -5 * pulse * amp - 7 * burst * amp, dt, 2, .76);
      el.fin!.setAttribute("transform", `translate(${(285 + fx).toFixed(2)} ${(168 + fy).toFixed(2)}) rotate(${fr.toFixed(2)})`);

      const gaze = cfg.target ?? pointer;
      const ex = sp("eyeX", mode === "guiding" ? clamp(gaze.x, -1, 1) * 5 + 3 : mode === "thinking" ? pulse * 3 : 0, dt, 4.3, .91);
      const ey = sp("eyeY", mode === "guiding" ? clamp(gaze.y, -1, 1) * 4 : -pulse * 2, dt, 4.2, .88);
      el.pupil!.setAttribute("transform", trans(ex, ey));

      const sx = sp("sensorX", amp * (-24 * pulse + 14 * burst + 10 * guide), dt, 2.7, .67);
      const sy = sp("sensorY", amp * (-13 * pulse - 20 * burst - 4 * guide) + breath * .5, dt, 2.8, .7);
      const sr = sp("sensorR", amp * (-19 * pulse + 28 * burst), dt, 2.7, .68);
      el.sensor!.setAttribute("transform", `translate(${(355 + sx).toFixed(2)} ${(239 + sy).toFixed(2)}) rotate(${sr.toFixed(2)})`);

      const contact = mode === "thinking"
        ? Math.max(0, 1 - Math.abs((t % 5.6) / 5.6 - .60) / .07)
        : 0;
      const contactSize = sp("contact", contact * amp, dt, 3, .8);
      el.contact!.setAttribute("opacity", (contactSize * .65).toFixed(2));
      el.contact!.setAttribute("r", (15 + contactSize * 9).toFixed(2));
      el.shadow!.setAttribute("rx", (77 + 5 * pulse + 9 * burst).toFixed(2));
      el.shadow!.setAttribute("opacity", (.48 - .1 * pulse).toFixed(2));

      raf = window.requestAnimationFrame(draw);
    }

    function stop() {
      if (raf) window.cancelAnimationFrame(raf);
      raf = 0;
      last = null;
    }
    function start() {
      const cfg = configRef.current;
      if (cfg.state === "sleeping" || media?.matches) {
        stop();
        applyStatic();
        return;
      }
      if (cfg.paused || document.hidden || !visible) {
        stop();
        return;
      }
      if (!raf) raf = window.requestAnimationFrame(draw);
    }
    function reset() {
      clock = 0;
      last = null;
      for (const p of Object.values(physics)) {
        p.v = 0; // keep the current position; begin the next state smoothly
      }
      start();
    }
    function onPointerMove(e: PointerEvent) {
      const r = root.getBoundingClientRect();
      pointer = {
        x: clamp((e.clientX - r.left - r.width / 2) / (r.width * .4), -1, 1),
        y: clamp((e.clientY - r.top - r.height / 2) / (r.height * .4), -1, 1),
      };
    }
    function onPointerLeave() { pointer = { x: 0, y: 0 }; }
    function onVisibility() { start(); }
    function onMotion() { start(); }

    root.addEventListener("pointermove", onPointerMove);
    root.addEventListener("pointerleave", onPointerLeave);
    document.addEventListener("visibilitychange", onVisibility);
    media?.addEventListener?.("change", onMotion);
    const observer = typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver(([entry]) => {
          visible = entry.isIntersecting;
          start();
        }, { threshold: 0 })
      : null;
    observer?.observe(root);
    runtimeRef.current = { start, stop, reset };
    start();
    return () => {
      stop();
      observer?.disconnect();
      root.removeEventListener("pointermove", onPointerMove);
      root.removeEventListener("pointerleave", onPointerLeave);
      document.removeEventListener("visibilitychange", onVisibility);
      media?.removeEventListener?.("change", onMotion);
      runtimeRef.current = null;
    };
  }, []);

  useEffect(() => {
    configRef.current = {
      state,
      intensity: clamp(intensity, 0, 1),
      paused,
      replayKey,
      target,
    };
    if (lastStateRef.current !== state || lastReplayRef.current !== replayKey) {
      runtimeRef.current?.reset();
      lastStateRef.current = state;
      lastReplayRef.current = replayKey;
    }
    if (paused) runtimeRef.current?.stop();
    else runtimeRef.current?.start();
  }, [state, intensity, paused, replayKey, target]);

  return (
    <svg
      ref={svgRef}
      className={className}
      width={size}
      height={size}
      viewBox="110 55 300 265"
      preserveAspectRatio="xMidYMid meet"
      xmlns="http://www.w3.org/2000/svg"
      role={label ? "img" : undefined}
      aria-label={label ?? undefined}
      aria-hidden={label === null || undefined}
      data-navi-state={state}
      style={{ display: "block", overflow: "visible", flexShrink: 0 }}
    >
      <defs>
        <linearGradient id={`${id}-shellgrad`} x1="0%" y1="0%" x2="90%" y2="100%">
          <stop offset="0%" stopColor="#59D0B8" />
          <stop offset="100%" stopColor="#2FAB9B" />
        </linearGradient>
        <linearGradient id={`${id}-winggrad`} x1="5%" y1="10%" x2="95%" y2="95%">
          <stop offset="0%" stopColor="#8998ED" />
          <stop offset="100%" stopColor="#5368D9" />
        </linearGradient>
        <clipPath id={`${id}-bodyclip`}>
          <path d="M169 202C153 173 155 143 170 121C189 97 221 97 246 111C269 124 283 148 295 166C314 187 307 216 282 238C256 261 219 268 192 252C176 242 171 224 169 202Z" />
        </clipPath>
      </defs>
      <ellipse data-navi="shadow" cx="246" cy="288" rx="77" ry="7" fill="#CBDCD4" opacity=".55" />
      <g data-navi="fin" transform="translate(285 168)">
        <path d="M-23 -34L64 -105Q73 -111 71 -98L58 26Q55 43 36 51L-5 55L-15 11Z" fill={`url(#${id}-winggrad)`} />
        <path d="M-23 -34L64 -105L46 -35L-10 1Z" fill="#A9B5F4" opacity=".8" />
        <path d="M-10 1L46 -35L58 26Q55 43 36 51L-5 55Z" fill="#4157BD" opacity=".45" />
      </g>
      <g data-navi="body">
        <path d="M169 202C153 173 155 143 170 121C189 97 221 97 246 111C269 124 283 148 295 166C314 187 307 216 282 238C256 261 219 268 192 252C176 242 171 224 169 202Z" fill={`url(#${id}-shellgrad)`} />
        <g clipPath={`url(#${id}-bodyclip)`}>
          <g data-navi="a">
            <path d="M122 92C163 83 220 78 257 108C268 119 279 137 270 154C260 174 228 177 203 191C172 207 146 190 134 166C118 139 111 110 122 92Z" fill="#7ADFC9" opacity=".86" />
          </g>
          <g data-navi="b">
            <path d="M249 122C281 129 321 155 332 195C339 225 304 258 270 274C243 286 210 261 219 237C226 209 258 192 262 172C266 156 237 142 249 122Z" fill="#2AA494" opacity=".84" />
          </g>
          <g data-navi="c">
            <path d="M133 199C163 189 188 204 212 224C242 250 256 272 240 291C207 300 155 267 137 238C131 227 124 209 133 199Z" fill="#3AB6A4" opacity=".8" />
          </g>
        </g>
        <path d="M180 141C193 119 212 115 224 114" fill="none" stroke="#A5EEDF" strokeWidth="5" opacity=".58" strokeLinecap="round" />
        <ellipse cx="220" cy="185" rx="33" ry="38" transform="rotate(-9 220 185)" fill="#F2FFF9" />
        <g data-navi="pupil">
          <ellipse cx="230" cy="185" rx="16" ry="20" transform="rotate(-8 230 185)" fill="#17364A" />
          <circle cx="233" cy="177" r="5" fill="#FFFFFF" />
        </g>
      </g>
      <g data-navi="sensor" transform="translate(355 239)">
        <rect x="-11" y="-11" width="22" height="22" rx="6" transform="rotate(22)" fill="#8CC9DF" />
        <path d="M-7 -8L3 -8" stroke="#E6FAFF" strokeWidth="2.5" strokeLinecap="round" opacity=".75" />
      </g>
      <circle data-navi="contact" cx="320" cy="225" r="15" fill="none" stroke="#A4F0DC" strokeWidth="3" opacity="0" />
    </svg>
  );
}

