// The command catalog and default keys. Pure data, shared by the content script
// (which implements the commands), the options page and the help panel.

export const COMMANDS = {
  scrollDown: { group: 'Scrolling', description: 'Scroll down (hold to keep going)' },
  scrollUp: { group: 'Scrolling', description: 'Scroll up (hold to keep going)' },
  scrollHalfDown: { group: 'Scrolling', description: 'Scroll down half a page' },
  scrollHalfUp: { group: 'Scrolling', description: 'Scroll up half a page' },
  scrollToTop: { group: 'Scrolling', description: 'Go to the top' },
  scrollToBottom: { group: 'Scrolling', description: 'Go to the bottom' },
  linkHints: { group: 'Links', description: 'Click a link or control' },
  linkHintsNewTab: { group: 'Links', description: 'Open a link in a new tab and switch to it' },
  closeTab: { group: 'Tabs', description: 'Close this tab' },
  restoreTab: { group: 'Tabs', description: 'Reopen the last closed tab' },
  previousTab: { group: 'Tabs', description: 'Go to the tab on the left' },
  nextTab: { group: 'Tabs', description: 'Go to the tab on the right' },
  goBack: { group: 'History', description: 'Go back' },
  goForward: { group: 'History', description: 'Go forward' },
  passThrough: { group: 'Modes', description: 'Send all keys to the page until Esc' },
  showHelp: { group: 'Modes', description: 'Show this help' },
} as const;

export type CommandName = keyof typeof COMMANDS;

export function isCommandName(name: string): name is CommandName {
  return Object.hasOwn(COMMANDS, name);
}

export const DEFAULT_KEYS: Readonly<Record<string, CommandName>> = {
  j: 'scrollDown',
  k: 'scrollUp',
  d: 'scrollHalfDown',
  u: 'scrollHalfUp',
  gg: 'scrollToTop',
  G: 'scrollToBottom',
  f: 'linkHints',
  F: 'linkHintsNewTab',
  x: 'closeTab',
  X: 'restoreTab',
  J: 'previousTab',
  K: 'nextTab',
  H: 'goBack',
  L: 'goForward',
  i: 'passThrough',
  '?': 'showHelp',
};
