import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { AddRepoDialog } from '../components/AddRepoDialog';
import { AddRepoCard, RepoCard } from '../components/RepoCard';
import { TopBar } from '../components/TopBar';
import { api } from '../lib/api';
import type { Repo } from '../lib/types';

export function Landing() {
  const qc = useQueryClient();
  const [query, setQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const repos = useQuery({
    queryKey: ['repos'],
    queryFn: api.listRepos,
    // Keeps indexing progress on the cards moving without a manual reload.
    refetchInterval: (q) =>
      (q.state.data ?? []).some((r: Repo) => r.status === 'INDEXING' || r.status === 'PENDING') ? 3000 : false,
  });

  const presets = useQuery({ queryKey: ['presets'], queryFn: api.presets });

  const addRepo = useMutation({
    mutationFn: ({ path, presetKey }: { path: string; presetKey: string }) => api.addRepo(path, presetKey),
    onSuccess: () => {
      setDialogOpen(false);
      setError(null);
      qc.invalidateQueries({ queryKey: ['repos'] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const removeRepo = useMutation({
    mutationFn: (id: string) => api.deleteRepo(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['repos'] }),
  });

  const filtered = useMemo(() => {
    const list = repos.data ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.path.toLowerCase().includes(q) ||
        (r.description ?? '').toLowerCase().includes(q) ||
        (r.language ?? '').toLowerCase().includes(q),
    );
  }, [repos.data, query]);

  return (
    <div className="min-h-full">
      <TopBar />

      <main className="page-frame mx-auto min-h-[calc(100vh-70px)] max-w-[1440px] px-6 pb-24 pt-16">
        <h1 className="text-center text-[34px] font-semibold tracking-tight">
          Which repo would you like to understand?
        </h1>

        <div className="mx-auto mt-8 flex max-w-xl items-center gap-2.5 rounded-xl border border-line bg-surface px-4 focus-within:border-faint">
          <Search size={17} className="shrink-0 text-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search imported repositories"
            className="w-full bg-transparent py-3.5 text-[15px] outline-none placeholder:text-faint"
          />
        </div>

        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AddRepoCard onClick={() => setDialogOpen(true)} />
          {filtered.map((repo) => (
            <RepoCard key={repo.id} repo={repo} onDelete={(r) => removeRepo.mutate(r.id)} />
          ))}
        </div>

        {repos.isLoading && <p className="mt-10 text-center text-[14px] text-faint">Loading…</p>}
        {!repos.isLoading && !filtered.length && query && (
          <p className="mt-10 text-center text-[14px] text-faint">No repositories match “{query}”.</p>
        )}
        {!repos.isLoading && !(repos.data ?? []).length && (
          <p className="mt-10 text-center text-[14px] text-faint">
            No repositories yet. Import a local checkout to generate its wiki.
          </p>
        )}
      </main>

      <AddRepoDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setError(null);
        }}
        presets={presets.data ?? []}
        busy={addRepo.isPending}
        error={error}
        onSubmit={(path, presetKey) => addRepo.mutate({ path, presetKey })}
      />
    </div>
  );
}
