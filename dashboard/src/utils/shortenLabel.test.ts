import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shortenLabel } from './shortenLabel.ts';

test('a label that fits is returned as it is', () => {
  assert.equal(shortenLabel('Anak Mama'), 'Anak Mama');
  assert.equal(shortenLabel('Yudhi Armyndhar'), 'Yudhi Armyndhar');
  assert.equal(shortenLabel('1234567890123456'), '1234567890123456');
  assert.equal(shortenLabel(''), '');
});

test('a long id keeps both ends and never exceeds the width', () => {
  const id = '120363251588904778';
  const out = shortenLabel(id);
  assert.equal(out, '12036325…8904778');
  assert.equal(Array.from(out).length, 16);
  assert.ok(out.startsWith(id.slice(0, 8)) && out.endsWith(id.slice(-7)));
});

test('a long name keeps its start', () => {
  const out = shortenLabel('Kopi Opsis Pemasaran Bersama');
  assert.equal(out, 'Kopi Opsis Pema…');
  assert.equal(Array.from(out).length, 16);
  assert.equal(shortenLabel('Yudhi Armyndharis'), 'Yudhi Armyndhar…');
});

test('a cut never splits an emoji', () => {
  // The 15th UTF-16 unit of this label is the first half of an emoji.
  const out = shortenLabel('Hustler Offer 🔥🔥🔥🔥🔥');
  assert.equal(out, 'Hustler Offer 🔥…');
  assert.equal(Array.from(out).length, 16);
});

test('the width can be set', () => {
  assert.equal(shortenLabel('abcdefghij', 5), 'abcd…');
  assert.equal(shortenLabel('1234567890', 5), '12…90');
});
