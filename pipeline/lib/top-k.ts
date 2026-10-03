/**
 * Keeps the best `k` items seen so far in O(n log k) time and O(k) memory.
 *
 * It is a binary min-heap ordered by `compare` (negative = a ranks better),
 * so the root is always the *worst* kept item: a new item only has to beat
 * the root to get in. This is how the extract stage ranks millions of
 * products without holding them all in memory.
 */
export class TopK<T> {
  private heap: T[] = [];
  private readonly k: number;
  private readonly compare: (a: T, b: T) => number;

  constructor(k: number, compare: (a: T, b: T) => number) {
    this.k = k;
    this.compare = compare;
  }

  get size(): number {
    return this.heap.length;
  }

  /** true if `item` would be kept; lets callers skip expensive work for losers. */
  wouldAccept(item: T): boolean {
    return this.heap.length < this.k || this.compare(item, this.heap[0]) < 0;
  }

  push(item: T): void {
    if (this.heap.length < this.k) {
      this.heap.push(item);
      this.siftUp(this.heap.length - 1);
    } else if (this.compare(item, this.heap[0]) < 0) {
      this.heap[0] = item;
      this.siftDown(0);
    }
  }

  /** Kept items, best first. */
  sorted(): T[] {
    return [...this.heap].sort(this.compare);
  }

  // "worse" = ranks lower = belongs nearer the root.
  private worse(i: number, j: number): boolean {
    return this.compare(this.heap[i], this.heap[j]) > 0;
  }

  private siftUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.worse(i, parent)) break;
      [this.heap[i], this.heap[parent]] = [this.heap[parent], this.heap[i]];
      i = parent;
    }
  }

  private siftDown(i: number): void {
    const n = this.heap.length;
    while (true) {
      const l = 2 * i + 1;
      const r = l + 1;
      let worst = i;
      if (l < n && this.worse(l, worst)) worst = l;
      if (r < n && this.worse(r, worst)) worst = r;
      if (worst === i) break;
      [this.heap[i], this.heap[worst]] = [this.heap[worst], this.heap[i]];
      i = worst;
    }
  }
}
