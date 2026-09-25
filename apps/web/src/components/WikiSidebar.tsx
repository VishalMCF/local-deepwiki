import clsx from 'clsx';
import { AlertCircle, Loader2 } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { indexedLabel } from '../lib/format';
import type { PageNode, Repo } from '../lib/types';

/** Left nav: the generated page tree plus the "Last indexed" line. */
export function WikiSidebar({ repo, tree }: { repo: Repo; tree: PageNode[] }) {
  return (
    <nav className="flex h-full flex-col gap-4 overflow-y-auto border-r border-line-soft px-4 py-6">
      <p className="px-2 text-[12.5px] text-faint">
        {indexedLabel(repo.indexedAt, repo.indexedShortSha)}
      </p>

      <ul className="space-y-0.5">
        {tree.map((node) => (
          <PageItem key={node.id} repoSlug={repo.slug} node={node} depth={0} />
        ))}
      </ul>

      {!tree.length && (
        <div className="space-y-2 px-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="skeleton h-4" style={{ width: `${55 + ((i * 11) % 40)}%` }} />
          ))}
        </div>
      )}
    </nav>
  );
}

function PageItem({ repoSlug, node, depth }: { repoSlug: string; node: PageNode; depth: number }) {
  return (
    <li>
      <NavLink
        to={`/repo/${repoSlug}/${node.slug}`}
        className={({ isActive }) =>
          clsx(
            'flex items-center gap-2 rounded-lg px-3 py-2 text-[14px] transition',
            depth > 0 && 'ml-3',
            isActive ? 'bg-elevated font-medium text-fg' : 'text-muted hover:bg-elevated/60 hover:text-fg',
          )
        }
      >
        <span className="truncate">{node.title}</span>
        {node.status === 'GENERATING' && <Loader2 size={12} className="shrink-0 animate-spin text-faint" />}
        {node.status === 'FAILED' && <AlertCircle size={12} className="shrink-0 text-danger" />}
      </NavLink>

      {node.children.length > 0 && (
        <ul className="space-y-0.5">
          {node.children.map((child) => (
            <PageItem key={child.id} repoSlug={repoSlug} node={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}
