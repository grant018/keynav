// Matches typed keys against bindings such as "j", "gg" or "<Esc>". Pure: no DOM,
// no chrome.*; the clock is injected so tests can control the timeout.
//
// A command fires as soon as its last key is typed. No binding may be a prefix of
// another (so "g" and "gg" can't both be bound); the timeout only clears a stale
// half-typed sequence.

export type Lookup<T> = { kind: 'command'; command: T } | { kind: 'pending' } | { kind: 'none' };

interface Node<T> {
  children: Map<string, Node<T>>;
  command?: { value: T };
}

/** Splits "g<Esc>x" into ["g", "<Esc>", "x"]. */
export function parseKeys(s: string): string[] {
  return s.match(/<[^>]+>|./gu) ?? [];
}

export class KeySequencer<T> {
  private readonly root: Node<T> = { children: new Map() };
  private buffer: string[] = [];
  private lastAt = 0;

  constructor(
    bindings: Record<string, T>,
    private readonly timeoutMs = 1500,
    private readonly now: () => number = () => Date.now(),
  ) {
    for (const [keys, command] of Object.entries(bindings)) this.add(keys, command);
  }

  get pending(): boolean {
    return this.buffer.length > 0;
  }

  reset(): void {
    this.buffer = [];
  }

  /** Whether some binding starts with `key`. */
  isBindingStart(key: string): boolean {
    return this.root.children.has(key);
  }

  feed(key: string): Lookup<T> {
    if (this.buffer.length && this.now() - this.lastAt > this.timeoutMs) this.buffer = [];

    let node = this.walk([...this.buffer, key]);
    if (!node && this.buffer.length) {
      // The half-typed sequence went nowhere: drop it and try this key on its own.
      this.buffer = [];
      node = this.walk([key]);
    }
    if (!node) return { kind: 'none' };

    if (node.command) {
      this.buffer = [];
      return { kind: 'command', command: node.command.value };
    }
    this.buffer.push(key);
    this.lastAt = this.now();
    return { kind: 'pending' };
  }

  private walk(keys: string[]): Node<T> | undefined {
    let node: Node<T> | undefined = this.root;
    for (const k of keys) {
      node = node.children.get(k);
      if (!node) return undefined;
    }
    return node;
  }

  private add(binding: string, command: T): void {
    const keys = parseKeys(binding);
    if (!keys.length) throw new Error('empty key binding');
    let node = this.root;
    for (const k of keys) {
      if (node.command) throw new Error(`binding "${binding}" extends another binding`);
      let next = node.children.get(k);
      if (!next) node.children.set(k, (next = { children: new Map() }));
      node = next;
    }
    if (node.command || node.children.size) throw new Error(`binding "${binding}" conflicts with another binding`);
    node.command = { value: command };
  }
}
