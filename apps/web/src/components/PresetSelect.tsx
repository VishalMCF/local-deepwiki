import clsx from 'clsx';
import { Check, ChevronDown, Zap } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Preset } from '../lib/types';

/** The "Fast v" dropdown: one entry per agent CLI + model + effort preset. */
export function PresetSelect({
  presets,
  value,
  onChange,
  disabled,
}: {
  presets: Preset[];
  value: string;
  onChange: (key: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = presets.find((p) => p.key === value) ?? presets[0];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13.5px] text-muted transition hover:bg-elevated hover:text-fg disabled:opacity-50"
      >
        <Zap size={14} />
        {current?.label ?? 'Fast'}
        <ChevronDown size={13} className="text-faint" />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-50 mb-2 w-72 overflow-hidden rounded-xl border border-line bg-surface shadow-xl">
          {presets.map((preset) => (
            <button
              key={preset.key}
              type="button"
              disabled={!preset.available}
              onClick={() => {
                onChange(preset.key);
                setOpen(false);
              }}
              className={clsx(
                'flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition',
                preset.available ? 'hover:bg-elevated' : 'cursor-not-allowed opacity-45',
              )}
            >
              <Check
                size={14}
                className={clsx('mt-1 shrink-0', preset.key === value ? 'text-accent' : 'invisible')}
              />
              <span className="min-w-0">
                <span className="block text-[13.5px] font-medium">{preset.label}</span>
                <span className="block truncate text-[12px] text-faint">
                  {preset.available ? (preset.hint ?? preset.cli) : `${preset.cli} CLI not installed`}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
