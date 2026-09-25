import clsx from 'clsx';
import { ArrowRight, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Preset } from '../lib/types';
import { PresetSelect } from './PresetSelect';

/** The pinned composer. Floating over the wiki, inline at the bottom of a thread. */
export function ChatBar({
  placeholder,
  presets,
  presetKey,
  onPresetChange,
  onSubmit,
  busy,
  floating,
  autoFocus,
}: {
  placeholder: string;
  presets: Preset[];
  presetKey: string;
  onPresetChange: (key: string) => void;
  onSubmit: (question: string) => void;
  busy?: boolean;
  floating?: boolean;
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  // Grow with content up to a cap, like the reference composer.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [value]);

  const submit = () => {
    const q = value.trim();
    if (!q || busy) return;
    setValue('');
    onSubmit(q);
  };

  return (
    <div
      className={clsx(
        'rounded-2xl border border-line bg-surface shadow-lg transition',
        floating && 'shadow-2xl',
      )}
    >
      <textarea
        ref={ref}
        rows={1}
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        className="block w-full resize-none bg-transparent px-5 pb-2 pt-4 text-[15px] outline-none placeholder:text-faint"
      />
      <div className="flex items-center gap-2 px-3 pb-2.5 pt-1">
        <PresetSelect presets={presets} value={presetKey} onChange={onPresetChange} disabled={busy} />
        <button
          type="button"
          onClick={submit}
          disabled={busy || !value.trim()}
          aria-label="Ask"
          className={clsx(
            'ml-auto grid size-9 place-items-center rounded-full transition',
            value.trim() && !busy
              ? 'bg-fg text-canvas hover:opacity-90'
              : 'border border-line text-faint',
          )}
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
        </button>
      </div>
    </div>
  );
}
