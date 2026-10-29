// The contact field of a sender, recipient or chat filter offers matching chats below it. A keyboard user reaches them
// with Tab from the field, so the list stays open while focus is inside the widget, closes once focus leaves it, and
// a pick keeps focus in the field, since the picked suggestion leaves the list under the keyboard.
import '../test-helpers/register-hooks.ts';
import { test, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, useState } from 'react';
import type { WebhookFilters } from '../services/api.ts';

let rtl: typeof import('@testing-library/react');
let FilterBuilder: (typeof import('./FilterBuilder.tsx'))['FilterBuilder'];

before(async () => {
  const { installJsdomGlobals } = await import('../test-helpers/jsdom.ts');
  await installJsdomGlobals();
  const { i18nReady } = await import('../i18n/index.ts');
  await i18nReady;
  rtl = await import('@testing-library/react');
  ({ FilterBuilder } = await import('./FilterBuilder.tsx'));
});

afterEach(() => rtl.cleanup());

function Harness() {
  const [filters, setFilters] = useState<WebhookFilters | null>({
    conditions: [{ field: 'sender', operator: 'is', value: [] }],
  });
  return createElement(
    'div',
    null,
    createElement(FilterBuilder, {
      filters,
      onChange: setFilters,
      chats: [{ id: '6281111111111@c.us', name: 'Alice' } as never],
    }),
    createElement('button', { type: 'button' }, 'Elsewhere'),
  );
}

// Timers and focus moves change React state, so both run inside act.
const wait = (ms: number) => rtl.act(() => new Promise<void>(resolve => setTimeout(resolve, ms)));
const focus = (element: HTMLElement) => rtl.act(() => element.focus());

function openSuggestions(): { input: HTMLInputElement; suggestion: HTMLElement } {
  const { container } = rtl.render(createElement(Harness));
  const input = container.querySelector<HTMLInputElement>('.chips-text')!;
  focus(input);
  rtl.fireEvent.change(input, { target: { value: 'Ali' } });
  return { input, suggestion: rtl.screen.getByRole('button', { name: /Alice/ }) };
}

const suggestionShown = () => rtl.screen.queryByRole('button', { name: /Alice/ }) !== null;

test('moving focus from the contact field into its suggestions keeps the suggestions open', async () => {
  const { suggestion } = openSuggestions();
  // What Tab does in a browser: focus moves to the next focusable element, the first suggestion.
  focus(suggestion);
  await wait(200);
  assert.ok(suggestionShown(), 'the suggestion a keyboard user tabbed to was removed from the page');
});

test('moving focus out of the widget still closes the suggestions', async () => {
  openSuggestions();
  focus(rtl.screen.getByRole('button', { name: 'Elsewhere' }));
  await wait(200);
  assert.equal(suggestionShown(), false, 'the suggestions stayed open after focus left the widget');
});

test('focus that returns to the field before the list closes keeps it open', async () => {
  const { input } = openSuggestions();
  focus(rtl.screen.getByRole('button', { name: 'Elsewhere' }));
  await wait(20);
  focus(input);
  await wait(200);
  assert.ok(suggestionShown(), 'a close scheduled before focus came back still ran');
});

test('picking a suggestion from the keyboard adds it and leaves focus in the field', async () => {
  const { suggestion } = openSuggestions();
  focus(suggestion);
  // Enter or Space on a focused button fires its click.
  rtl.fireEvent.click(suggestion);
  assert.ok(rtl.screen.getByRole('button', { name: 'Remove Alice' }), 'the picked contact was not added');
  assert.equal((document.activeElement as HTMLElement | null)?.className, 'chips-text', 'focus left the field');
});
