import { sql, type SQL } from 'drizzle-orm';

/**
 * Search-query primitives shared by the server-side bookmark search, the admin
 * bookmark search and the admin tag search. Kept out of `filter.ts` so
 * importing them never pulls the client-side highlighting into a server bundle.
 */

/** Splits a query on whitespace into lowercased terms. */
export function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/** Escapes LIKE metacharacters, so a typed `%` matches a literal percent sign. */
export function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

/**
 * One AND-group per term; each must match somewhere in the column. Returns an
 * empty list for a blank query, which the caller spreads into its own `and()`.
 */
export function termConditions(query: string, column: SQL | unknown): SQL[] {
  return tokenize(query).map(
    (term) => sql`${column} like ${likePattern(term)} escape '\\'`,
  );
}
