import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { SourceChip, type SourceRef } from './SourceChip';

/** The collapsible "Relevant source files" header on every wiki page. */
export function RelevantSources({
  paths,
  onOpen,
}: {
  paths: string[];
  onOpen?: (source: SourceRef) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!paths.length) return null;

  return (
    <div className="mb-7 overflow-hidden rounded-xl border border-line">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-4 py-3.5 text-left text-[15px] transition hover:bg-elevated/50"
      >
        {open ? <ChevronDown size={16} className="text-faint" /> : <ChevronRight size={16} className="text-faint" />}
        Relevant source files
        <span className="ml-auto text-[12.5px] text-faint">{paths.length}</span>
      </button>
      {open && (
        <div className="flex flex-wrap gap-2 border-t border-line px-4 py-4">
          {paths.map((path) => (
            <SourceChip key={path} source={{ path }} onOpen={onOpen} />
          ))}
        </div>
      )}
    </div>
  );
}
