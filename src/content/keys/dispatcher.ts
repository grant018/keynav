// Routes key events: decides which ones the extension consumes, runs commands, and
// hides consumed keys from the page completely (keydown, keypress and keyup).
import { normalizeKey } from './normalize';
import { KeySequencer } from './trie';
import { currentGrabber } from './grab';
import { inInsertMode, leaveInsertMode } from '../modes/insert';
import type { SiteState } from '../../shared/settings';

export interface Command {
  /**
   * Runs on keydown. A command that acts for as long as the key is held (smooth
   * scrolling) returns a release function, called on keyup; auto-repeat is ignored.
   */
  run(): void | (() => void);
  /** Re-run on keyboard auto-repeat. Others run once per press. */
  repeatable?: boolean;
}

export class Dispatcher {
  private seq: KeySequencer<Command>;
  /** event.code of keys whose keydown we consumed; their keypress/keyup are hidden too. */
  private readonly swallowed = new Set<string>();
  /** event.code -> command to re-run while the key auto-repeats. */
  private readonly repeating = new Map<string, Command>();
  /** event.code -> release function of a held command, called on keyup. */
  private readonly releases = new Map<string, () => void>();

  /**
   * @param site whether KeyNav is active on this page and which keys the user's
   *   site rules leave to it (read on every key, so rule changes apply at once)
   */
  constructor(
    bindings: Record<string, Command>,
    private readonly site: () => SiteState = () => ({ active: true, passKeys: new Set() }),
  ) {
    this.seq = new KeySequencer(bindings);
  }

  /** Replace the key bindings (the user changed their key mappings). */
  setBindings(bindings: Record<string, Command>): void {
    this.seq = new KeySequencer(bindings);
  }

  onKeyDown = (e: KeyboardEvent): void => {
    if (!e.isTrusted || e.isComposing) return;

    // A mode that took over the keyboard (hints, help, pass-through) gets every key.
    const grabber = currentGrabber();
    if (grabber) {
      if (e.repeat) {
        if (this.swallowed.has(e.code)) this.hide(e);
      } else if (grabber(e)) {
        this.consume(e);
      }
      return;
    }

    const site = this.site();
    if (!site.active) return;

    if (e.repeat) {
      this.repeating.get(e.code)?.run();
      // Also hide repeats of bound keys whose first press happened elsewhere: hold
      // `x` and the repeats land in the next tab, which must not close too.
      if (this.swallowed.has(e.code) || this.isBoundOutsideInsert(e, site)) this.hide(e);
      return;
    }

    const key = normalizeKey(e);
    if (key === null) return;

    if (inInsertMode()) {
      if (key === '<Esc>') {
        leaveInsertMode();
        this.consume(e);
      }
      return;
    }

    // Site rule pass keys go to the page, unless they continue a sequence already begun.
    if (!this.seq.pending && site.passKeys.has(key)) return;

    const hadPending = this.seq.pending;
    const result = this.seq.feed(key);
    if (result.kind === 'none') {
      // Esc that cancelled a half-typed sequence was ours; any other unbound key is the page's.
      if (key === '<Esc>' && hadPending) this.consume(e);
      return;
    }

    this.consume(e);
    if (result.kind === 'command') {
      this.release(e.code); // shouldn't be held, but never leak a running hold
      const release = result.command.run();
      if (release) this.releases.set(e.code, release);
      else if (result.command.repeatable) this.repeating.set(e.code, result.command);
    }
  };

  onKeyPress = (e: KeyboardEvent): void => {
    if (this.swallowed.has(e.code)) this.hide(e);
  };

  onKeyUp = (e: KeyboardEvent): void => {
    if (!this.swallowed.has(e.code)) return;
    this.hide(e);
    this.swallowed.delete(e.code);
    this.repeating.delete(e.code);
    this.release(e.code);
  };

  /** Forget held keys and half-typed sequences (window lost focus, etc.). */
  reset = (): void => {
    this.seq.reset();
    this.swallowed.clear();
    this.repeating.clear();
    for (const code of [...this.releases.keys()]) this.release(code);
  };

  private isBoundOutsideInsert(e: KeyboardEvent, site: SiteState): boolean {
    const key = normalizeKey(e);
    return key !== null && !site.passKeys.has(key) && this.seq.isBindingStart(key) && !inInsertMode();
  }

  private release(code: string): void {
    const release = this.releases.get(code);
    this.releases.delete(code);
    release?.();
  }

  private consume(e: KeyboardEvent): void {
    this.hide(e);
    this.swallowed.add(e.code);
  }

  private hide(e: KeyboardEvent): void {
    e.preventDefault();
    e.stopImmediatePropagation();
  }
}
