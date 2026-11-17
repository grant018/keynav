// Tab commands (handled by the background worker) and `F`.
import { fire } from '../shared/messages';
import { showHints } from './hints/controller';
import type { Command } from './keys/dispatcher';

export const tabCommands = {
  linkHintsNewTab: { run: () => showHints('newTab') },
  closeTab: { run: () => fire({ type: 'closeTab' }) },
  restoreTab: { run: () => fire({ type: 'restoreTab' }) },
  previousTab: { run: () => fire({ type: 'switchTab', delta: -1 }) },
  nextTab: { run: () => fire({ type: 'switchTab', delta: 1 }) },
} satisfies Record<string, Command>;
