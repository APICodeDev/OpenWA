import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// The clear button of the New chat panel's search field carried a class no stylesheet defined, so it rendered as
// a native grey button that was taller than the text beside it and grew the field when a character was typed.

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, 'Chats.css'), 'utf8');
const panel = readFileSync(join(here, '..', 'components', 'chats', 'NewChatPanel.tsx'), 'utf8');

test('the new chat search clear button is a small icon button that does not grow the field', () => {
  assert.match(panel, /className="search-clear"/, 'the panel no longer renders the button this rule styles');
  const rule = /\.chats-page \.search-clear\s*\{([^}]*)\}/.exec(css);
  assert.ok(rule, 'no style for the search clear button');
  assert.match(rule[1], /border:\s*none/);
  assert.match(rule[1], /background:\s*transparent/);
  assert.match(rule[1], /width:\s*28px/);
  assert.match(rule[1], /height:\s*28px/);
  // Taller than the line of text it sits beside, so its block margin takes the difference back.
  assert.match(rule[1], /margin-block:\s*-0\.5rem/);
});

test('the active filter pill is heavier than the others, so it does not differ by colour alone', () => {
  const weight = (selector: string): number => {
    const rule = new RegExp(`${selector.replace(/[.]/g, '\\.')}\\s*\\{([^}]*)\\}`).exec(css);
    assert.ok(rule, `no rule for ${selector}`);
    return Number(/font-weight:\s*(\d+)/.exec(rule[1])?.[1]);
  };
  assert.ok(
    weight('.chats-page .chat-filter-pill.active') > weight('.chats-page .chat-filter-pill'),
    'the active pill has the weight of the others',
  );
});

// Every rule body whose selector list names the selector, in order.
const rulesFor = (selector: string): string[] =>
  [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(m => m[1].split(',').some(s => s.trim() === selector))
    .map(m => m[2]);

test('the chat list header is as high as the room header, whatever minimum the dashboard header has', () => {
  const height = (selector: string): string | undefined =>
    rulesFor(selector)
      .map(body => /(?:^|;)\s*height:\s*([^;]+)/.exec(body)?.[1].trim())
      .find(Boolean);
  assert.equal(height('.chats-page .sidebar-header'), height('.chats-page .room-header'));
  // Layout.css styles .sidebar-header, the class this header shares, with min-height: 72px.
  const layout = readFileSync(join(here, '..', 'components', 'Layout.css'), 'utf8');
  assert.match(layout, /\.sidebar-header\s*\{[^}]*min-height:\s*72px/, 'the dashboard header no longer sets a minimum');
  assert.ok(
    rulesFor('.chats-page .sidebar-header').some(body => /min-height:\s*0[;\s]/.test(body)),
    'the dashboard minimum stretches the chat list header',
  );
});

test('the session picker is capped by the list column, so the layout never clips its last sessions or its link', () => {
  // .chats-layout clips what runs past it; the picker hung from the switcher had no cap but the list's own 360px.
  const declared = (selector: string, property: string): string | undefined =>
    rulesFor(selector)
      .map(body => new RegExp(`(?:^|;)\\s*${property}:\\s*([^;]+)`).exec(body)?.[1].trim())
      .filter(Boolean)
      .pop();
  assert.equal(declared('.chats-page .chats-layout', 'overflow'), 'hidden');
  assert.equal(declared('.chats-page .chats-sidebar', 'position'), 'relative');
  assert.equal(declared('.chats-page .session-switcher', 'position'), undefined, 'the switcher holds the picker');
  assert.equal(declared('.chats-page .session-picker', 'position'), 'absolute');
  assert.match(declared('.chats-page .session-picker', 'max-height') ?? '', /^calc\(100% - /);
  assert.equal(declared('.chats-page .session-picker', 'overflow'), 'hidden');
  assert.equal(declared('.chats-page .session-picker-list', 'overflow-y'), 'auto');
});

test('the page gives up the phone bar under the query that draws it, so 768px keeps its full height', () => {
  const layout = readFileSync(join(here, '..', 'components', 'Layout.tsx'), 'utf8');
  const mobile = /const MOBILE_QUERY = '([^']+)'/.exec(layout)?.[1];
  assert.ok(mobile, 'Layout.tsx no longer names its phone query');
  const offset = /@media ([^{]+)\{\s*\.chats-page\s*\{\s*height:\s*calc\(100dvh - 3\.5rem\)/.exec(css);
  assert.ok(offset, 'the page no longer takes the phone bar off its height');
  assert.equal(offset[1].trim(), mobile);
});

test('the room is never narrower than its composer, so the emoji button cannot slide under the send button', () => {
  const value = (selector: string, property: string): string => {
    const found = rulesFor(selector)
      .map(body => new RegExp(`(?:^|;)\\s*${property}:\\s*([^;]+)`).exec(body)?.[1].trim())
      .filter((v): v is string => Boolean(v))
      .pop();
    assert.ok(found, `${selector} sets no ${property}`);
    return found;
  };
  const px = (length: string): number => {
    const m = /^(-?[\d.]+)(px|rem)?$/.exec(length);
    assert.ok(m && (m[2] || Number(m[1]) === 0), `${length} is not a px or rem length`);
    return Number(m[1]) * (m[2] === 'rem' ? 16 : 1);
  };
  // Each side of a padding-inline: one value is both, two are the start and the end.
  const sides = (shorthand: string): number => {
    const parts = shorthand.split(/\s+/).map(px);
    return parts.length === 1 ? 2 * parts[0] : parts[0] + parts[1];
  };
  const pill = '.chats-page .message-input-pill';
  const floor =
    sides(value('.chats-page .room-input-footer', 'padding-inline')) +
    2 * px(value('.chats-page .input-form', 'gap')) +
    px(value('.chats-page .btn-input-accessory', 'width')) +
    sides(value(pill, 'padding-inline')) +
    2 * px(value(pill, 'border').split(/\s+/)[0]) +
    px(value(pill, 'gap')) +
    px(value(`${pill} .message-text-input`, 'min-width')) +
    px(value('.chats-page .btn-input-accessory.inside', 'width')) +
    px(value('.chats-page .btn-send-message', 'width'));
  assert.ok(px(value('.chats-page .chats-room', 'min-width')) >= floor, `the composer needs ${floor}px`);
  // The list column is what gives way when the room needs the width.
  assert.notEqual(value('.chats-page .chats-sidebar', 'flex-shrink'), '0');
});
