"use client";

import katex from "katex";
import "katex/dist/katex.min.css";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { highlight } from "./highlight";
import { useDark } from "./use-dark";

function Placeholder({ label, error }: { label: string; error?: string }) {
  return (
    <div className="grid min-h-40 place-items-center rounded-lg bg-surface-muted/60 p-4 text-sm text-muted">
      {error ? `Could not render this ${label}.` : `Loading ${label}…`}
    </div>
  );
}

// Categorical palette that reads in both themes.
const PALETTE = ["#6366f1", "#14b8a6", "#f59e0b", "#ec4899", "#0ea5e9", "#84cc16", "#a855f7", "#ef4444"];

export function Chart({ spec, title }: { spec: Record<string, unknown>; title?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const dark = useDark();
  const [error, setError] = useState<string>();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let finalize: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      const [{ default: embed }, { expressionInterpreter }] = await Promise.all([import("vega-embed"), import("vega-interpreter")]);
      if (cancelled || !ref.current) return;
      const fg = dark ? "#e5e7eb" : "#1f2937";
      const grid = dark ? "#374151" : "#e5e7eb";
      const single = "mark" in spec && !("width" in spec);
      const { $schema: _schema, ...rest } = spec;
      try {
        const result = await embed(ref.current, { ...rest, ...(single ? { width: "container" } : {}) } as never, {
          actions: false,
          renderer: "svg",
          // Expressions are interpreted, never compiled with eval; data never loads from the network.
          ast: true,
          expr: expressionInterpreter,
          loader: { load: () => Promise.reject(new Error("External data is disabled")) } as never,
          config: {
            autosize: { type: "fit", contains: "padding" },
            padding: { left: 12, right: 12, top: 8, bottom: 8 },
            background: null,
            font: "inherit",
            view: { stroke: null },
            range: { category: PALETTE },
            axis: { labelColor: fg, titleColor: fg, gridColor: grid, domainColor: grid, tickColor: grid, labelFontSize: 12 },
            legend: { labelColor: fg, titleColor: fg },
            title: { color: fg },
            text: { color: fg },
            mark: { color: PALETTE[0] },
          } as never,
        });
        finalize = () => result.finalize();
        setReady(true);
      } catch (err) {
        setError((err as Error).message);
      }
    })();
    return () => {
      cancelled = true;
      finalize?.();
    };
  }, [spec, dark]);

  return (
    <figure>
      {title && <figcaption className="mb-2 text-sm font-medium">{title}</figcaption>}
      {!ready && <Placeholder label="chart" error={error} />}
      <div ref={ref} className="w-full overflow-x-auto" role="img" aria-label={title ?? "Chart"} />
    </figure>
  );
}

export function Diagram({ code }: { code: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const dark = useDark();
  const [svg, setSvg] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { default: mermaid } = await import("mermaid");
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: dark ? "dark" : "neutral",
        fontFamily: "inherit",
      });
      try {
        const { svg } = await mermaid.render(`mmd${id}${dark ? "d" : "l"}`, code);
        if (!cancelled) setSvg(svg);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, dark, id]);

  if (!svg) return <Placeholder label="diagram" error={error} />;
  // Mermaid's strict mode sanitizes its own output.
  return <div className="flex justify-center overflow-x-auto [&_svg]:h-auto [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: svg }} />;
}

export function MathBlock({ tex }: { tex: string }) {
  const html = useMemo(
    () => katex.renderToString(tex, { displayMode: true, throwOnError: false, trust: false, strict: "ignore" }),
    [tex],
  );
  return <div className="overflow-x-auto py-2" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function CodeBlock({ code, language }: { code: string; language: string }) {
  const [html, setHtml] = useState<string>();
  useEffect(() => {
    let cancelled = false;
    highlight(code, language)
      .then((out) => !cancelled && out && setHtml(out))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [code, language]);

  return (
    <div className="relative overflow-hidden rounded-lg border border-border text-sm">
      <span className="absolute top-2 right-3 font-mono text-xs text-muted">{language}</span>
      {html ? (
        <div className="shiki-wrap overflow-x-auto [&_pre]:p-4" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <pre className="overflow-x-auto bg-surface-muted p-4">
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
}
