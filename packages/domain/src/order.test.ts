import { describe, expect, it } from 'vitest';
import { compareOrder, isOrderKey, keyAt, keyBetween, keysBetween } from './order.ts';

/** A small seeded PRNG (mulberry32), so a failing run can be repeated. */
function random(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const sortedByKey = (items: { id: string; orderKey: string }[]) =>
  items.toSorted(compareOrder).map((item) => item.id);

describe('order keys', () => {
  it('makes a first key and keys before, after and between', () => {
    const first = keyBetween();
    const before = keyBetween(null, first);
    const after = keyBetween(first);
    const middle = keyBetween(first, after);
    expect([after, middle, first, before].toSorted()).toEqual([before, first, middle, after]);
  });

  it('makes n keys in order', () => {
    const keys = keysBetween(null, null, 5);
    expect(keys).toHaveLength(5);
    expect(keys.toSorted()).toEqual(keys);
    const inside = keysBetween(keys[1], keys[2], 3);
    expect([keys[1], ...inside, keys[2]].toSorted()).toEqual([keys[1], ...inside, keys[2]]);
  });

  it('places a key at an index among sorted keys', () => {
    const keys = keysBetween(null, null, 3);
    for (let i = 0; i <= keys.length; i++) {
      const key = keyAt(keys, i);
      expect([...keys, key].toSorted().indexOf(key)).toBe(i);
    }
    expect(keyAt([], 0)).toBe(keyBetween());
  });

  it('rejects an index outside the list', () => {
    expect(() => keyAt(['a0'], 2)).toThrow(RangeError);
    expect(() => keyAt(['a0'], -1)).toThrow(RangeError);
    expect(() => keyAt(['a0'], 0.5)).toThrow(RangeError);
  });

  it('recognises valid keys', () => {
    expect(isOrderKey(keyBetween())).toBe(true);
    expect(isOrderKey(keyBetween('a0', 'a1'))).toBe(true);
    expect(isOrderKey('')).toBe(false);
    expect(isOrderKey('a')).toBe(false);
    expect(isOrderKey('a00')).toBe(false); // a trailing zero is never generated
    expect(isOrderKey('!x')).toBe(false);
  });

  it('breaks a tie on the key by id, in byte order', () => {
    const items = [
      { id: 'b', orderKey: 'a1' },
      { id: 'a', orderKey: 'a1' },
      { id: 'c', orderKey: 'a0' },
      { id: 'Z', orderKey: 'a1' },
    ];
    expect(sortedByKey(items)).toEqual(['c', 'Z', 'a', 'b']);
    expect(compareOrder(items[0]!, items[0]!)).toBe(0);
  });

  it('compares keys by byte, not by locale', () => {
    // localeCompare would put "a" before "B"; the database's "C" collation puts "B" first.
    expect(
      sortedByKey([
        { id: '1', orderKey: 'a' },
        { id: '2', orderKey: 'B' },
      ]),
    ).toEqual(['2', '1']);
  });

  it('keeps the order through 1,000 random inserts and moves', () => {
    const next = random(42);
    const list: { id: string; orderKey: string }[] = []; // the expected order
    for (let step = 0; step < 1000; step++) {
      const move = list.length > 1 && next() < 0.4;
      const item = move
        ? list.splice(Math.floor(next() * list.length), 1)[0]!
        : { id: `s${step}`, orderKey: '' };
      // Skew towards the ends and one hot spot, where keys grow fastest.
      const r = next();
      const index =
        r < 0.2
          ? 0
          : r < 0.4
            ? list.length
            : r < 0.6
              ? Math.min(1, list.length)
              : Math.floor(next() * (list.length + 1));
      item.orderKey = keyAt(
        list.map((s) => s.orderKey),
        index,
      );
      list.splice(index, 0, item);
      expect(isOrderKey(item.orderKey)).toBe(true);
    }
    expect(list.length).toBeGreaterThan(500);
    expect(sortedByKey(list.toReversed())).toEqual(list.map((s) => s.id));
    expect(new Set(list.map((s) => s.orderKey)).size).toBe(list.length);
    expect(Math.max(...list.map((s) => s.orderKey.length))).toBeLessThan(200);
  });
});
