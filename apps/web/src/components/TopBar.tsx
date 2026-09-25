import { Share2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ThemeToggle } from './ThemeToggle';

export function TopBar({ subtitle, right }: { subtitle?: string; right?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line-soft bg-canvas/85 backdrop-blur">
      <div className="flex h-[70px] items-center gap-3 px-6">
        <Link to="/" className="text-[19px] font-semibold tracking-tight">
          DeepWiki
        </Link>
        {subtitle && <span className="truncate text-[18px] text-muted">{subtitle}</span>}

        <div className="ml-auto flex items-center gap-3">
          {right}
          <button
            onClick={() => {
              navigator.clipboard?.writeText(window.location.href);
            }}
            className="flex h-9 items-center gap-2 rounded-lg bg-accent px-3.5 text-[13.5px] font-medium text-accent-fg transition hover:opacity-90"
          >
            <Share2 size={15} />
            Share
          </button>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
