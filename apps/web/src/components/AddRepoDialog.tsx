import { FolderOpen, Loader2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Preset } from '../lib/types';
import { PresetSelect } from './PresetSelect';

export function AddRepoDialog({
  open,
  onClose,
  onSubmit,
  presets,
  busy,
  error,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (path: string, presetKey: string) => void;
  presets: Preset[];
  busy?: boolean;
  error?: string | null;
}) {
  const [path, setPath] = useState('');
  const [presetKey, setPresetKey] = useState(presets.find((p) => p.isDefault)?.key ?? 'fast');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    if (open) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4" onMouseDown={onClose}>
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
      >
        <div className="flex items-center border-b border-line px-5 py-4">
          <h2 className="text-[17px] font-semibold">Import a local repository</h2>
          <button onClick={onClose} aria-label="Close" className="ml-auto text-faint hover:text-fg">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <label className="block">
            <span className="mb-2 block text-[13.5px] text-muted">Directory path</span>
            <div className="flex items-center gap-2 rounded-xl border border-line bg-elevated px-3 focus-within:border-accent">
              <FolderOpen size={16} className="shrink-0 text-faint" />
              <input
                ref={inputRef}
                value={path}
                onChange={(e) => setPath(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && path.trim() && onSubmit(path.trim(), presetKey)}
                placeholder="/Users/you/code/my-project"
                spellCheck={false}
                className="w-full bg-transparent py-3 font-mono text-[13.5px] outline-none placeholder:text-faint"
              />
            </div>
            <span className="mt-2 block text-[12.5px] text-faint">
              Absolute path, or <code className="font-mono">~/code/my-project</code>. The directory is read
              only — nothing is written to it.
            </span>
          </label>

          <div className="flex items-center justify-between rounded-xl border border-line px-3 py-2">
            <span className="text-[13.5px] text-muted">Agent used for indexing</span>
            <PresetSelect presets={presets} value={presetKey} onChange={setPresetKey} />
          </div>

          {error && (
            <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-[13px] text-danger">
              {error}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-5 py-4">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-[13.5px] text-muted hover:text-fg">
            Cancel
          </button>
          <button
            onClick={() => path.trim() && onSubmit(path.trim(), presetKey)}
            disabled={!path.trim() || busy}
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-[13.5px] font-medium text-accent-fg transition hover:opacity-90 disabled:opacity-50"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            Import and generate wiki
          </button>
        </div>
      </div>
    </div>
  );
}
