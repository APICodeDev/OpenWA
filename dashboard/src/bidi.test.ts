import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Under <html dir="rtl"> a phone number or an id shown as plain text is laid out right to left: "+1 555 000 1111"
// reads "1111 000 555 1+" and "15550001111@c.us" splits around the at sign. Each such value has to be
// isolated so it keeps its own left to right order.

const SRC = dirname(fileURLToPath(import.meta.url));

function body(file: string, selector: string): string {
  const css = readFileSync(join(SRC, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (m[1].split(',').some(s => s.trim() === selector)) return m[2];
  }
  assert.fail(`${file} has no ${selector} rule`);
}

test('the open chat header isolates the phone number and the raw id', () => {
  for (const selector of ['.chats-page .room-contact-phone', '.chats-page .room-contact-jid']) {
    assert.match(body('pages/Chats.css', selector), /unicode-bidi:\s*plaintext/, selector);
  }
});

test('the header lines hug the start edge with the name instead of stretching across it', () => {
  // A paragraph of digits or Latin letters resolves to left to right under plaintext, so inside a stretched box
  // its text would sit on the left of an Arabic header while the name sits on the right.
  for (const selector of ['.chats-page .room-contact-phone', '.chats-page .room-contact-jid']) {
    assert.match(body('pages/Chats.css', selector), /align-self:\s*flex-start/, selector);
  }
});

test('text cut with an ellipsis takes its direction from its own characters', () => {
  // The ellipsis removes the end of the line in the direction of the box. Under the page direction a Latin name in
  // an Arabic page (or an Arabic one in an English page) lost its first letters and kept its last.
  const cut = [
    '.chats-page .chat-item-name',
    '.chats-page .chat-item-snippet',
    '.chats-page .room-contact-info h3',
    '.chats-page .preview-filename',
    '.chats-page .quote-body',
    '.chats-page .replying-to-title',
    '.chats-page .replying-to-body',
    '.chats-page .group-info-member .name',
  ];
  for (const selector of cut) {
    const rule = body('pages/Chats.css', selector);
    assert.match(rule, /text-overflow:\s*ellipsis/, `${selector} is expected to be cut with an ellipsis`);
    assert.match(rule, /unicode-bidi:\s*plaintext/, selector);
  }
});
