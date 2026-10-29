"use client";

import type { AnimationSpec } from "@coursmith/course-schema";
import { animate, motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PlayerAsset } from "@/lib/player";

type Spec<P extends AnimationSpec["preset"]> = Extract<AnimationSpec, { preset: P }>;

/** Re-mounting the children replays their entrance animation. */
function Replayable({ children }: { children: (key: number) => React.ReactNode }) {
  const [key, setKey] = useState(0);
  return (
    <div className="relative">
      {children(key)}
      <button
        type="button"
        onClick={() => setKey((k) => k + 1)}
        className="absolute -top-1 right-0 rounded-md px-2 py-1 text-xs text-muted hover:bg-surface-muted hover:text-foreground"
      >
        ↻ Replay
      </button>
    </div>
  );
}

const appear = (i: number, reduce: boolean | null) => ({
  initial: reduce ? false : { opacity: 0, y: 12 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.4 },
  transition: { delay: reduce ? 0 : i * 0.25, duration: 0.45, ease: "easeOut" as const },
});

function Sequence({ spec }: { spec: Spec<"sequence"> }) {
  const reduce = useReducedMotion();
  const layout =
    spec.layout === "column" ? "flex flex-col" : spec.layout === "grid" ? "grid grid-cols-2 sm:grid-cols-3" : "flex flex-wrap";
  return (
    <Replayable>
      {(key) => (
        <ol key={key} className={`${layout} gap-3 pt-6`}>
          {spec.items.map((item, i) => (
            <motion.li
              key={i}
              {...appear(i, reduce)}
              className="flex min-w-36 flex-1 items-start gap-3 rounded-xl border border-border bg-surface p-4"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-lg">
                {item.icon ?? <span className="font-mono text-sm text-primary">{i + 1}</span>}
              </span>
              <span>
                <span className="block font-medium">{item.label}</span>
                {item.description && <span className="mt-0.5 block text-sm text-muted">{item.description}</span>}
              </span>
            </motion.li>
          ))}
        </ol>
      )}
    </Replayable>
  );
}

function wrapLabel(text: string, max = 16): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if ((line + " " + word).trim().length > max && line) {
      lines.push(line);
      line = word;
    } else line = (line + " " + word).trim();
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

/** Nodes are placed by depth from the sources; particles travel along the edges. */
function Flow({ spec }: { spec: Spec<"flow"> }) {
  const reduce = useReducedMotion();
  const layout = useMemo(() => {
    const depth = new Map<string, number>();
    const incoming = new Map(spec.nodes.map((n) => [n.id, 0]));
    for (const e of spec.edges) incoming.set(e.to, (incoming.get(e.to) ?? 0) + 1);
    const queue = spec.nodes.filter((n) => !incoming.get(n.id)).map((n) => n.id);
    if (!queue.length) queue.push(spec.nodes[0]!.id);
    for (const id of queue) depth.set(id, 0);
    for (let i = 0; i < queue.length; i++) {
      const from = queue[i]!;
      for (const e of spec.edges.filter((x) => x.from === from)) {
        if (!depth.has(e.to)) {
          depth.set(e.to, depth.get(from)! + 1);
          queue.push(e.to);
        }
      }
    }
    for (const n of spec.nodes) if (!depth.has(n.id)) depth.set(n.id, 0);
    const levels: string[][] = [];
    for (const n of spec.nodes) (levels[depth.get(n.id)!] ??= []).push(n.id);
    const horizontal = spec.direction === "LR";
    const W = 168, H = 76, GAP_MAIN = 64, GAP_CROSS = 24;
    const maxCross = Math.max(...levels.map((l) => l.length));
    const pos = new Map<string, { x: number; y: number }>();
    levels.forEach((ids, li) => {
      ids.forEach((id, ci) => {
        const offset = ((maxCross - ids.length) * ((horizontal ? H : W) + GAP_CROSS)) / 2;
        const main = li * ((horizontal ? W : H) + GAP_MAIN);
        const cross = offset + ci * ((horizontal ? H : W) + GAP_CROSS);
        pos.set(id, horizontal ? { x: main, y: cross } : { x: cross, y: main });
      });
    });
    const width = horizontal ? levels.length * (W + GAP_MAIN) - GAP_MAIN : maxCross * (W + GAP_CROSS) - GAP_CROSS;
    const height = horizontal ? maxCross * (H + GAP_CROSS) - GAP_CROSS : levels.length * (H + GAP_MAIN) - GAP_MAIN;
    return { pos, W, H, width, height, horizontal };
  }, [spec]);

  const { pos, W, H, horizontal } = layout;
  const edgePath = (from: string, to: string) => {
    const a = pos.get(from)!, b = pos.get(to)!;
    const [x1, y1] = horizontal ? [a.x + W, a.y + H / 2] : [a.x + W / 2, a.y + H];
    const [x2, y2] = horizontal ? [b.x, b.y + H / 2] : [b.x + W / 2, b.y];
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    return horizontal ? `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}` : `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`;
  };
  const label = (id: string) => spec.nodes.find((n) => n.id === id)!.label;

  return (
    <svg viewBox={`-8 -8 ${layout.width + 16} ${layout.height + 16}`} className="mx-auto h-auto w-full max-w-3xl" role="img" aria-label={spec.nodes.map((n) => n.label).join(" → ")}>
      <defs>
        <marker id="flow-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--muted)" />
        </marker>
      </defs>
      {spec.edges.map((e, i) => {
        const d = edgePath(e.from, e.to);
        return (
          <g key={i}>
            <path d={d} fill="none" stroke="var(--border)" strokeWidth={2} markerEnd="url(#flow-arrow)" />
            {!reduce && (
              <circle r={4} fill="var(--primary)">
                <animateMotion dur="2.4s" repeatCount="indefinite" begin={`${i * 0.4}s`} path={d} />
              </circle>
            )}
            {e.label && (() => {
              const a = pos.get(e.from)!, b = pos.get(e.to)!;
              return (
                <text x={(a.x + b.x + W) / 2} y={(a.y + b.y + H) / 2 - (horizontal ? 8 : 0)} textAnchor="middle" fontSize={13} fill="var(--muted)">
                  {e.label}
                </text>
              );
            })()}
          </g>
        );
      })}
      {spec.nodes.map((n, i) => {
        const p = pos.get(n.id)!;
        const lines = wrapLabel(label(n.id));
        return (
          <motion.g key={n.id} initial={reduce ? false : { opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: i * 0.2 }}>
            <rect x={p.x} y={p.y} width={W} height={H} rx={12} fill="var(--surface)" stroke="var(--primary)" strokeWidth={1.5} />
            <text x={p.x + W / 2} y={p.y + H / 2 - ((lines.length - 1) * 19) / 2} textAnchor="middle" dominantBaseline="middle" fontSize={16} fontWeight={500} fill="var(--foreground)">
              {lines.map((l, li) => (
                <tspan key={li} x={p.x + W / 2} dy={li ? 19 : 0}>
                  {l}
                </tspan>
              ))}
            </text>
          </motion.g>
        );
      })}
    </svg>
  );
}

function Timeline({ spec }: { spec: Spec<"timeline"> }) {
  const reduce = useReducedMotion();
  return (
    <Replayable>
      {(key) => (
        <ol key={key} className="relative ml-3 border-l-2 border-border pt-6">
          {spec.events.map((e, i) => (
            <motion.li key={i} {...appear(i, reduce)} className="relative mb-6 pl-6 last:mb-0">
              <span className="absolute top-1.5 -left-[7px] size-3 rounded-full bg-primary ring-4 ring-background" />
              <p className="font-mono text-xs text-primary">{e.date}</p>
              <p className="font-medium">{e.title}</p>
              {e.description && <p className="text-sm text-muted">{e.description}</p>}
            </motion.li>
          ))}
        </ol>
      )}
    </Replayable>
  );
}

/** Steps light up one after another; learners can also pick a step. */
function Process({ spec }: { spec: Spec<"process"> }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.5 });
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);
  const [auto, setAuto] = useState(true);
  useEffect(() => {
    if (!inView || !auto || reduce) return;
    const t = setInterval(() => setActive((a) => (a + 1) % spec.steps.length), 2600);
    return () => clearInterval(t);
  }, [inView, auto, reduce, spec.steps.length]);
  const step = spec.steps[active]!;
  return (
    <div ref={ref}>
      <ol className="flex items-center gap-1" aria-label="Process steps">
        {spec.steps.map((s, i) => (
          <li key={i} className="flex flex-1 items-center gap-1">
            <button
              type="button"
              onClick={() => {
                setActive(i);
                setAuto(false);
              }}
              aria-current={i === active ? "step" : undefined}
              aria-label={s.title}
              className={`grid size-9 shrink-0 place-items-center rounded-full border-2 font-mono text-sm transition ${
                i === active ? "scale-110 border-primary bg-primary text-primary-foreground" : i < active ? "border-primary text-primary" : "border-border text-muted"
              }`}
            >
              {i + 1}
            </button>
            {i < spec.steps.length - 1 && (
              <span className="h-0.5 flex-1 overflow-hidden rounded bg-border">
                <motion.span className="block h-full bg-primary" animate={{ width: i < active ? "100%" : "0%" }} transition={{ duration: 0.4 }} />
              </span>
            )}
          </li>
        ))}
      </ol>
      <motion.div key={active} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-5 rounded-xl border border-border bg-surface p-5" aria-live="polite">
        <p className="text-xs text-muted">
          Step {active + 1} of {spec.steps.length}
        </p>
        <p className="mt-1 text-lg font-medium">{step.title}</p>
        {step.description && <p className="mt-1 text-muted">{step.description}</p>}
      </motion.div>
    </div>
  );
}

function CompareSide({ side, assets }: { side: Spec<"compare">["before"]; assets: Record<string, PlayerAsset> }) {
  const asset = side.asset ? assets[side.asset] : undefined;
  return (
    <div className="flex h-full flex-col gap-3 p-5">
      <span className="w-fit rounded-full bg-background/90 px-2.5 py-1 text-xs font-semibold">{side.label}</span>
      {asset && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={asset.url} alt={asset.alt} className="max-h-64 w-full rounded-lg object-contain" />
      )}
      {side.text && <p>{side.text}</p>}
    </div>
  );
}

/** Before/after with a draggable divider (a native range input, so it works with the keyboard). */
function Compare({ spec, assets }: { spec: Spec<"compare">; assets: Record<string, PlayerAsset> }) {
  const [split, setSplit] = useState(50);
  return (
    <div>
      <div className="relative min-h-48 overflow-hidden rounded-xl border border-border">
        <div className="bg-surface-muted">
          <CompareSide side={spec.before} assets={assets} />
        </div>
        <div className="absolute inset-0 bg-primary/10 backdrop-blur-[1px]" style={{ clipPath: `inset(0 0 0 ${split}%)` }}>
          <div className="h-full bg-surface">
            <CompareSide side={spec.after} assets={assets} />
          </div>
        </div>
        <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-primary" style={{ left: `${split}%` }} />
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={split}
        onChange={(e) => setSplit(Number(e.target.value))}
        aria-label={`Slide between ${spec.before.label} and ${spec.after.label}`}
        className="mt-3 w-full accent-[var(--primary)]"
      />
    </div>
  );
}

function CounterValue({ from, to, decimals, unit }: { from: number; to: number; decimals: number; unit?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduce = useReducedMotion();
  const fmt = useMemo(() => new Intl.NumberFormat(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }), [decimals]);
  useEffect(() => {
    if (!ref.current) return;
    if (!inView || reduce) {
      ref.current.textContent = fmt.format(inView || reduce ? to : from);
      return;
    }
    const controls = animate(from, to, {
      duration: 1.6,
      ease: "easeOut",
      onUpdate: (v) => {
        if (ref.current) ref.current.textContent = fmt.format(v);
      },
    });
    return () => controls.stop();
  }, [inView, reduce, from, to, fmt]);
  return (
    <span className="font-mono text-3xl font-semibold tabular-nums sm:text-4xl">
      <span ref={ref}>{fmt.format(from)}</span>
      {unit && <span className="ml-1 text-lg text-muted">{unit}</span>}
    </span>
  );
}

function Counter({ spec }: { spec: Spec<"counter"> }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-[repeat(auto-fit,minmax(10rem,1fr))]">
      {spec.items.map((item, i) => (
        <div key={i} className="rounded-xl border border-border bg-surface p-5">
          <dd>
            <CounterValue from={item.from} to={item.to} decimals={item.decimals} unit={item.unit} />
          </dd>
          <dt className="mt-1 text-sm text-muted">{item.label}</dt>
        </div>
      ))}
    </dl>
  );
}

/** Inline SVG whose elements are highlighted in turn; the rest fades back. */
function HighlightSvg({ spec, markup }: { spec: Spec<"highlight-svg">; markup?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const inView = useInView(host, { amount: 0.4 });
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);
  const [auto, setAuto] = useState(true);

  useEffect(() => {
    if (!inView || !auto || reduce) return;
    const t = setInterval(() => setActive((a) => (a + 1) % spec.highlights.length), 3000);
    return () => clearInterval(t);
  }, [inView, auto, reduce, spec.highlights.length]);

  useEffect(() => {
    const root = host.current;
    if (!root) return;
    spec.highlights.forEach((h, i) => {
      const el = root.querySelector<SVGElement>(`[id="${CSS.escape(h.elementId)}"]`);
      if (!el) return;
      el.style.transition = "opacity 300ms, filter 300ms";
      el.style.opacity = i === active ? "1" : "0.3";
      el.style.filter = i === active ? "drop-shadow(0 0 6px var(--primary))" : "none";
    });
  }, [active, spec.highlights, markup]);

  if (!markup) return <p className="text-sm text-muted">Illustration unavailable.</p>;
  const h = spec.highlights[active]!;
  return (
    <div className="grid items-center gap-5 sm:grid-cols-[1.2fr_1fr]">
      {/* Sanitized at upload: no scripts, event handlers or external references. */}
      <div ref={host} className="[&_svg]:h-auto [&_svg]:max-h-96 [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: markup }} />
      <ol className="space-y-2">
        {spec.highlights.map((x, i) => (
          <li key={x.elementId}>
            <button
              type="button"
              onClick={() => {
                setActive(i);
                setAuto(false);
              }}
              aria-current={i === active ? "true" : undefined}
              className={`w-full rounded-xl border p-3 text-left transition ${i === active ? "border-primary bg-primary/10" : "border-border hover:bg-surface-muted"}`}
            >
              <span className="font-medium">{x.label}</span>
              {i === active && x.description && <span className="mt-1 block text-sm text-muted">{x.description}</span>}
            </button>
          </li>
        ))}
      </ol>
      <p className="sr-only" aria-live="polite">
        {h.label}: {h.description}
      </p>
    </div>
  );
}

export function Animation({
  spec,
  assets,
  svgMarkup,
}: {
  spec: AnimationSpec;
  assets: Record<string, PlayerAsset>;
  svgMarkup: Record<string, string>;
}) {
  switch (spec.preset) {
    case "sequence":
      return <Sequence spec={spec} />;
    case "flow":
      return <Flow spec={spec} />;
    case "timeline":
      return <Timeline spec={spec} />;
    case "process":
      return <Process spec={spec} />;
    case "compare":
      return <Compare spec={spec} assets={assets} />;
    case "counter":
      return <Counter spec={spec} />;
    case "highlight-svg":
      return <HighlightSvg spec={spec} markup={svgMarkup[spec.asset]} />;
  }
}
