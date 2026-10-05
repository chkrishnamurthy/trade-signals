/**
 * Pure helpers for rearranging a watchlist's members by hand.
 *
 * The server numbers positions from the array it is sent, so every move returns
 * the COMPLETE new order — never a partial one.
 */

export type MoveTarget = 'up' | 'down' | 'top' | 'bottom';

/** `ids` with `id` moved. Returns the same array when the move changes nothing. */
export function moveMember(
  ids: readonly number[],
  id: number,
  target: MoveTarget,
): readonly number[] {
  const from = ids.indexOf(id);
  if (from === -1) return ids;
  const to =
    target === 'up'
      ? from - 1
      : target === 'down'
        ? from + 1
        : target === 'top'
          ? 0
          : ids.length - 1;
  return moveToIndex(ids, from, to);
}

/**
 * `ids` with `id` dropped onto `onto`: it takes that row's place and the rows
 * between shift by one, so dragging down lands below the target and dragging up
 * lands above it — what a person expects from a list.
 */
export function dropMember(ids: readonly number[], id: number, onto: number): readonly number[] {
  const from = ids.indexOf(id);
  const to = ids.indexOf(onto);
  if (from === -1 || to === -1) return ids;
  return moveToIndex(ids, from, to);
}

function moveToIndex(ids: readonly number[], from: number, to: number): readonly number[] {
  if (to < 0 || to >= ids.length || to === from) return ids;
  const next = [...ids];
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return ids;
  next.splice(to, 0, moved);
  return next;
}
