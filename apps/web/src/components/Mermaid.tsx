import { Maximize2, Minus, Plus } from 'lucide-react';
import mermaid from 'mermaid';
import { useEffect, useId, useRef, useState } from 'react';
import { useTheme } from '../lib/theme';

let initialisedFor: string | null = null;

function ensureInit(theme: string) {
  if (initialisedFor === theme) return;
  initialisedFor = theme;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: theme === 'dark' ? 'dark' : 'neutral',
    fontFamily: "'Inter', system-ui, sans-serif",
    themeVariables:
      theme === 'dark'
        ? { background: '#141414', primaryColor: '#1d1d1d', primaryTextColor: '#ededed',
            primaryBorderColor: '#3a3a3a', lineColor: '#5a5a5a', secondaryColor: '#161616',
            tertiaryColor: '#101010', clusterBkg: '#121212', clusterBorder: '#2a2a2a' }
        : { background: '#ffffff', primaryColor: '#ffffff', primaryTextColor: '#16161a',
            primaryBorderColor: '#c9c9c4', lineColor: '#9a9a94', secondaryColor: '#f4f4f2',
            tertiaryColor: '#fafafa', clusterBkg: '#f7f7f5', clusterBorder: '#e2e2de' },
  });
}

/** Renders a ```mermaid block with the zoom controls from the reference UI. */
export function Mermaid({ chart }: { chart: string }) {
  const { theme } = useTheme();
  const id = useId().replace(/:/g, '_');
  const hostRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    ensureInit(theme);

    (async () => {
      try {
        const { svg } = await mermaid.render(`m${id}`, chart);
        if (!cancelled && hostRef.current) {
          hostRef.current.innerHTML = svg;
          setError(null);
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message ?? 'Diagram failed to render');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chart, theme, id]);

  if (error) {
    return (
      <pre className="my-4 overflow-x-auto rounded-xl border border-line bg-elevated p-4 text-[12.5px] text-muted">
        {chart}
      </pre>
    );
  }

  return (
    <div className="group relative my-5 overflow-hidden rounded-xl border border-line bg-elevated">
      <div className="absolute right-2 top-2 z-10 flex gap-1 opacity-0 transition group-hover:opacity-100">
        {[
          { icon: <Plus size={14} />, label: 'Zoom in', fn: () => setZoom((z) => Math.min(z + 0.2, 3)) },
          { icon: <Minus size={14} />, label: 'Zoom out', fn: () => setZoom((z) => Math.max(z - 0.2, 0.4)) },
          { icon: <Maximize2 size={14} />, label: 'Reset', fn: () => setZoom(1) },
        ].map((b) => (
          <button
            key={b.label}
            aria-label={b.label}
            onClick={b.fn}
            className="grid size-7 place-items-center rounded-md border border-line bg-surface text-muted transition hover:text-fg"
          >
            {b.icon}
          </button>
        ))}
      </div>
      <div className="overflow-auto p-5">
        <div
          ref={hostRef}
          style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}
          className="flex justify-center transition-transform [&_svg]:max-w-full [&_svg]:h-auto"
        />
      </div>
    </div>
  );
}
