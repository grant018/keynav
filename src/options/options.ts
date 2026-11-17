// Options page. Every change is validated and saved as you type; open tabs pick the
// new settings up from storage immediately.
import { COMMANDS, DEFAULT_KEYS, type CommandName } from '../shared/commands';
import { buildKeymap } from '../shared/keymap';
import {
  hintCharsError,
  LIMITS,
  loadSettings,
  normalizeSettings,
  onSettingsChanged,
  saveSettings,
  type Rule,
  type Settings,
} from '../shared/settings';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const enabled = $<HTMLInputElement>('enabled');
const rulesBox = $<HTMLDivElement>('rules');
const keymap = $<HTMLTextAreaElement>('keymap');
const keymapErrors = $<HTMLUListElement>('keymap-errors');
const hintChars = $<HTMLInputElement>('hint-chars');
const hintCharsErr = $<HTMLDivElement>('hint-chars-error');
const scrollStep = $<HTMLInputElement>('scroll-step');
const scrollSpeed = $<HTMLInputElement>('scroll-speed');
const smooth = $<HTMLInputElement>('smooth');
const status = $<HTMLDivElement>('status');

let settings: Settings;

// --- Rendering ------------------------------------------------------------------

function renderRules(rules: Rule[]): void {
  rulesBox.replaceChildren();
  const head = (text: string) => Object.assign(document.createElement('div'), { className: 'head', textContent: text });
  rulesBox.append(head('Pattern'), head('Pass keys'), head(''));
  rules.forEach((rule, i) => addRuleRow(rule, i));
}

function addRuleRow(rule: Rule, i: number): void {
  const pattern = Object.assign(document.createElement('input'), {
    type: 'text', value: rule.pattern, placeholder: 'mail.google.com', spellcheck: false,
  });
  pattern.dataset.rule = 'pattern';
  pattern.setAttribute('aria-label', `Rule ${i + 1} pattern`);
  const pass = Object.assign(document.createElement('input'), {
    type: 'text', value: rule.passKeys, placeholder: 'off', spellcheck: false, className: 'mono',
  });
  pass.dataset.rule = 'pass';
  pass.setAttribute('aria-label', `Rule ${i + 1} pass keys (empty: KeyNav off)`);
  const remove = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Remove' });
  remove.setAttribute('aria-label', `Remove rule ${i + 1}`);
  remove.addEventListener('click', () => {
    pattern.remove();
    pass.remove();
    remove.remove();
    scheduleSave();
  });
  rulesBox.append(pattern, pass, remove);
}

function renderCommands(): void {
  const table = $<HTMLTableElement>('commands');
  for (const [name, { description }] of Object.entries(COMMANDS) as [CommandName, { description: string }][]) {
    const keys = Object.entries(DEFAULT_KEYS).filter(([, c]) => c === name).map(([k]) => k);
    const row = table.insertRow();
    row.insertCell().append(Object.assign(document.createElement('code'), { textContent: name }));
    row.insertCell().textContent = keys.join(' ') || '—';
    row.insertCell().textContent = description;
  }
}

function render(s: Settings): void {
  enabled.checked = s.enabled;
  renderRules(s.rules);
  keymap.value = s.keyMappings;
  hintChars.value = s.hintChars;
  scrollStep.value = String(s.scrollStep);
  scrollSpeed.value = String(s.scrollSpeed);
  smooth.checked = s.smoothScroll;
  showKeymapErrors();
}

function showKeymapErrors(): void {
  keymapErrors.replaceChildren(
    ...buildKeymap(keymap.value).errors.map((e) => Object.assign(document.createElement('li'), { textContent: e })),
  );
}

// --- Reading and saving ---------------------------------------------------------

function readForm(): Settings {
  const rules: Rule[] = [];
  const patterns = rulesBox.querySelectorAll<HTMLInputElement>('[data-rule=pattern]');
  const passes = rulesBox.querySelectorAll<HTMLInputElement>('[data-rule=pass]');
  patterns.forEach((p, i) => rules.push({ pattern: p.value, passKeys: passes[i]?.value ?? '' }));

  const chars = hintChars.value.trim();
  const charsError = hintCharsError(chars);
  hintCharsErr.textContent = charsError ?? '';

  return normalizeSettings({
    enabled: enabled.checked,
    rules,
    keyMappings: keymap.value,
    hintChars: charsError ? settings.hintChars : chars, // keep the last good value
    scrollStep: Number(scrollStep.value),
    scrollSpeed: Number(scrollSpeed.value),
    smoothScroll: smooth.checked,
  });
}

let saveTimer = 0;
function scheduleSave(): void {
  clearTimeout(saveTimer);
  status.textContent = '';
  saveTimer = window.setTimeout(save, 300);
}

async function save(): Promise<void> {
  settings = readForm();
  showKeymapErrors();
  await saveSettings(settings);
  status.textContent = 'Saved';
}

// --- Wiring ---------------------------------------------------------------------

document.addEventListener('input', scheduleSave);
document.addEventListener('change', scheduleSave);

// Numbers: show the value actually used once the field is left.
for (const [input, key] of [[scrollStep, 'scrollStep'], [scrollSpeed, 'scrollSpeed']] as const) {
  input.min = String(LIMITS[key][0]);
  input.max = String(LIMITS[key][1]);
  input.addEventListener('blur', () => (input.value = String(readForm()[key])));
}

$<HTMLButtonElement>('add-rule').addEventListener('click', () => {
  addRuleRow({ pattern: '', passKeys: '' }, rulesBox.querySelectorAll('[data-rule=pattern]').length);
  rulesBox.querySelectorAll<HTMLInputElement>('[data-rule=pattern]').item(
    rulesBox.querySelectorAll('[data-rule=pattern]').length - 1,
  ).focus();
});

$<HTMLButtonElement>('open-shortcuts').addEventListener('click', () => {
  void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});

// The toolbar button or shortcut can switch KeyNav on/off while this page is open.
onSettingsChanged((s) => {
  if (s.enabled !== enabled.checked) enabled.checked = s.enabled;
  settings = { ...settings, enabled: s.enabled };
});

renderCommands();
void loadSettings().then((s) => {
  settings = s;
  render(s);
  document.body.dataset.ready = 'true';
});
