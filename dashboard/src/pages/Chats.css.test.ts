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
