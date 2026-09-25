import clsx from 'clsx';
import { useEffect, useState } from 'react';
import type { Heading } from './Markdown';

/** Right rail "On this page", with the active heading tracked on scroll. */
export function TocPanel({ headings }: { headings: Heading[] }) {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    if (!headings.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-80px 0px -70% 0px', threshold: [0, 1] },
    );

    for (const h of headings) {
      const el = document.getElementById(h.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [headings]);

  if (!headings.length) return null;

  return (
    <aside className="sticky top-[90px] max-h-[calc(100vh-120px)] overflow-y-auto">
      <h2 className="mb-3 text-[19px] font-semibold tracking-tight">On this page</h2>
      <ul className="space-y-1.5 text-[13.5px]">
        {headings.map((h) => (
          <li key={h.id} style={{ paddingLeft: (h.depth - 1) * 14 }}>
            <a
              href={`#${h.id}`}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(h.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                history.replaceState(null, '', `#${h.id}`);
              }}
              className={clsx(
                'block truncate transition',
                active === h.id ? 'font-medium text-fg' : 'text-muted hover:text-fg',
              )}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </aside>
  );
}
