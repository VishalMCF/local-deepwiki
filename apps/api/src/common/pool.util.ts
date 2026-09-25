/** Run tasks with bounded concurrency. Keeps agent fan-out from thrashing the machine. */
export async function runPool<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  const queue = items.map((item, index) => ({ item, index }));
  const size = Math.max(1, Math.min(limit, queue.length));

  await Promise.all(
    Array.from({ length: size }, async () => {
      for (;;) {
        const next = queue.shift();
        if (!next) return;
        await worker(next.item, next.index);
      }
    }),
  );
}
