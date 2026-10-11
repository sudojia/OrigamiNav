/** Multi-row insert chunk size; keeps statements under pg's parameter cap. */
const INSERT_CHUNK = 500;

/** Runs `fn` once per chunk-sized slice, in order. */
export async function chunked<T>(
  rows: T[],
  fn: (chunk: T[]) => unknown,
  size: number = INSERT_CHUNK,
): Promise<void> {
  for (let start = 0; start < rows.length; start += size) {
    await fn(rows.slice(start, start + size));
  }
}
