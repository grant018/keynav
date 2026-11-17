// Custom key mappings, written one per line on the options page:
//
//   map <keys> <command>     bind keys (e.g. "map gt nextTab")
//   unmap <keys>             remove a binding
//   unmapAll                 start from nothing
//   # comment
//
// Applied on top of the defaults. Pure: no DOM, no chrome.*.
import { DEFAULT_KEYS, isCommandName, type CommandName } from './commands';
import { parseKeys } from '../content/keys/trie';

export interface Keymap {
  keys: Record<string, CommandName>;
  errors: string[];
}

export function buildKeymap(text: string): Keymap {
  const keys: Record<string, CommandName> = { ...DEFAULT_KEYS };
  const userMapped = new Set<string>();
  const errors: string[] = [];

  text.split('\n').forEach((raw, i) => {
    const words = raw.trim().split(/\s+/).filter(Boolean);
    if (!words.length || words[0]!.startsWith('#')) return; // blank or comment line
    const where = `Line ${i + 1}`;
    const [verb, ...rest] = words;
    // Each command takes a fixed number of words; a `#` word after them starts a
    // comment. (Counting words rather than stripping every `#` lets `map # …` work.)
    const arity = verb === 'map' ? 2 : verb === 'unmap' ? 1 : 0;
    const args = rest.slice(0, arity);
    const extra = rest.slice(arity);
    const tidy = !extra.length || extra[0]!.startsWith('#');

    if (verb === 'map' && args.length === 2 && tidy) {
      const [k, command] = args as [string, string];
      if (!isCommandName(command)) {
        errors.push(`${where}: unknown command "${command}" (see the list of commands below)`);
      } else {
        keys[k] = command;
        userMapped.add(k);
      }
    } else if (verb === 'unmap' && args.length === 1 && tidy) {
      if (!(args[0]! in keys)) errors.push(`${where}: "${args[0]}" is not mapped`);
      delete keys[args[0]!];
      userMapped.delete(args[0]!);
    } else if (verb === 'unmapAll' && tidy) {
      for (const k of Object.keys(keys)) delete keys[k];
      userMapped.clear();
    } else {
      errors.push(`${where}: expected "map <keys> <command>", "unmap <keys>" or "unmapAll"`);
    }
  });

  // A binding can't be the start of another ("g" and "gg"): the shorter would always
  // win. Defaults are kept; the conflicting custom mapping is dropped.
  const ordered = Object.keys(keys).sort((a, b) => Number(userMapped.has(a)) - Number(userMapped.has(b)));
  const accepted: string[] = [];
  for (const k of ordered) {
    const clash = accepted.find((a) => isPrefix(a, k) || isPrefix(k, a));
    if (clash) {
      errors.push(`"${k}" conflicts with "${clash}" (one is the start of the other); unmap "${clash}" first`);
      delete keys[k];
    } else {
      accepted.push(k);
    }
  }
  return { keys, errors };
}

function isPrefix(a: string, b: string): boolean {
  const ka = parseKeys(a);
  const kb = parseKeys(b);
  return ka.length <= kb.length && ka.every((k, i) => k === kb[i]);
}
