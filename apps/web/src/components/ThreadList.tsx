import clsx from 'clsx';
import { MessageSquare, Plus, Trash2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { relativeTime } from '../lib/format';
import type { Thread } from '../lib/types';

/** Per-repo conversation history rail. */
export function ThreadList({
  repoSlug,
  threads,
  activeId,
  onDelete,
}: {
  repoSlug: string;
  threads: Thread[];
  activeId?: string;
  onDelete: (id: string) => void;
}) {
  const navigate = useNavigate();

  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto border-r border-line-soft px-3 py-5">
      <button
        onClick={() => navigate(`/repo/${repoSlug}/chat`)}
        className="mb-1 flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-[13.5px] text-muted transition hover:text-fg"
      >
        <Plus size={14} />
        New conversation
      </button>

      <p className="px-2 pt-2 text-[11.5px] font-medium uppercase tracking-wide text-faint">
        Conversations
      </p>

      {!threads.length && (
        <p className="px-2 py-3 text-[13px] text-faint">No conversations yet.</p>
      )}

      <ul className="space-y-0.5">
        {threads.map((thread) => (
          <li key={thread.id} className="group relative">
            <Link
              to={`/repo/${repoSlug}/chat/${thread.id}`}
              className={clsx(
                'block rounded-lg px-3 py-2.5 pr-8 transition',
                thread.id === activeId ? 'bg-elevated' : 'hover:bg-elevated/60',
              )}
            >
              <span className="flex items-start gap-2">
                <MessageSquare size={13} className="mt-1 shrink-0 text-faint" />
                <span className="min-w-0">
                  <span className="line-clamp-2 text-[13.5px] leading-snug">{thread.title}</span>
                  <span className="mt-0.5 block text-[11.5px] text-faint">
                    {relativeTime(thread.updatedAt)}
                    {thread._count ? ` · ${Math.ceil(thread._count.messages / 2)} turn(s)` : ''}
                  </span>
                </span>
              </span>
            </Link>
            <button
              onClick={() => onDelete(thread.id)}
              aria-label="Delete conversation"
              className="absolute right-2 top-2.5 grid size-6 place-items-center rounded text-faint opacity-0 transition hover:text-danger group-hover:opacity-100"
            >
              <Trash2 size={13} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
