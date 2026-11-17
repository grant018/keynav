// Command implementations, keyed by the names in shared/commands.ts (which also
// holds the default keys). Users remap keys on the options page (shared/keymap.ts).
import type { CommandName } from '../shared/commands';
import { showHints } from './hints/controller';
import type { Command } from './keys/dispatcher';
import { enterPassThrough } from './modes/pass';
import { scrollCommands } from './scroll/commands';
import { currentKeymap } from './settings';
import { tabCommands } from './tabs';
import { showHelp } from './ui/help';

export const commands = {
  ...scrollCommands,
  ...tabCommands,
  linkHints: { run: () => showHints() },
  passThrough: { run: enterPassThrough },
  showHelp: { run: () => showHelp(currentKeymap()) },
} satisfies Record<CommandName, Command>;

export function resolveBindings(keys: Record<string, CommandName>): Record<string, Command> {
  return Object.fromEntries(Object.entries(keys).map(([k, name]) => [k, commands[name]]));
}
