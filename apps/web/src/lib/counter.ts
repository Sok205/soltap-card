// Counter will be backed by the indexer in Phase 3. For now, return 0
// so mint can proceed with edition #1 (current + 1).
export async function getCurrentEdition(): Promise<number> {
  return 0;
}

export async function incrementCounter(): Promise<void> {
  // No-op in Phase 2. Replaced by indexer-driven reconciliation in Phase 4.
}
