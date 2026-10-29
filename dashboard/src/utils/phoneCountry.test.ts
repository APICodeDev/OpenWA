import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flagOfRegion, regionOfPhone } from './phoneCountry.ts';

test('a number resolves to the country its two- or three-digit code dials', () => {
  assert.equal(regionOfPhone('491747127865'), 'DE');
  assert.equal(regionOfPhone('+43 664 1234567'), 'AT');
  assert.equal(regionOfPhone('351912345678'), 'PT');
  assert.equal(regionOfPhone('971501234567'), 'AE');
});

test('a code several countries share, or one that is unknown or too short, has no country', () => {
  // NANP: the United States, Canada and the Caribbean all dial 1.
  assert.equal(regionOfPhone('14155552671'), null);
  assert.equal(regionOfPhone('8001234567'), null);
  assert.equal(regionOfPhone('4912'), null);
  assert.equal(regionOfPhone(null), null);
});

test('7 is Kazakhstan in its 7 range and Russia in its own, and the toll-free range both share is neither', () => {
  assert.equal(regionOfPhone('79161234567'), 'RU');
  assert.equal(regionOfPhone('78123456789'), 'RU');
  assert.equal(regionOfPhone('77011234567'), 'KZ');
  assert.equal(regionOfPhone('78001234567'), null);
});

// A code several territories share answers one of them only for the ranges that are that territory's alone.
test('a shared code answers the territory whose own range the number is in, and no region in a shared range', () => {
  const cases: Array<[string, string | null]> = [
    // The United Kingdom and the Crown Dependencies: landline codes and mobile blocks of their own.
    ['447400123456', 'GB'],
    ['442079460000', 'GB'],
    ['441534123456', 'JE'],
    ['447797123456', 'JE'],
    ['441481256789', 'GG'],
    ['447781123456', 'GG'],
    ['441624567890', 'IM'],
    ['447624123456', 'IM'],
    ['447924123456', null],
    ['443001234567', null],
    // Reunion and Mayotte.
    ['262262123456', 'RE'],
    ['262692123456', 'RE'],
    ['262269601234', 'YT'],
    ['262639012345', 'YT'],
    ['262801234567', null],
    // Guadeloupe, Saint Barthelemy and Saint Martin share every range.
    ['590690123456', null],
    ['590590271234', null],
    // Bonaire, Sint Eustatius and Saba against Curacao.
    ['5997001234', 'BQ'],
    ['5993181234', 'BQ'],
    ['59995123456', 'CW'],
    // A territory's own landlines against the mobile range it takes from the country around it.
    ['61891621234', 'CC'],
    ['61891641234', 'CX'],
    ['61212345678', 'AU'],
    ['61412345678', null],
    ['4779012345', 'SJ'],
    ['4721234567', 'NO'],
    ['4791234567', null],
    ['35818123456', 'AX'],
    ['35891234567', 'FI'],
    ['358401234567', null],
    ['390669812345', 'VA'],
    ['390612345678', 'IT'],
    ['393123456789', null],
    ['212522123456', 'MA'],
    ['212528812345', null],
    ['212612345678', null],
  ];
  assert.deepEqual(
    cases.map(([phone]) => [phone, regionOfPhone(phone)]),
    cases,
  );
});

test('a region becomes its flag emoji', () => {
  assert.equal(flagOfRegion('DE'), '🇩🇪');
  assert.equal(flagOfRegion('gb'), '🇬🇧');
});
