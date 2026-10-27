'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

/**
 * `--best-effort` lets a source install carry on without a patch it cannot place. A write that fails
 * part-way is not that case: fs.writeFileSync has already truncated the target, so the dependency is
 * left broken and no later run can tell. Each patcher must exit non-zero then, and only then.
 */

// realpath: os.tmpdir() is a symlink on macOS and the patcher resolves its own location through it,
// so the fault below would never match the target path.
const WORK = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'patch-write-failure-')));
test.after(() => fs.rmSync(WORK, { recursive: true, force: true }));

const PREFIX_BYTES = 64;
const MARKER = 'FIXTURE_WRITE_FAULT';
const PRELOAD = path.join(WORK, 'write-fault.cjs');
fs.writeFileSync(
  PRELOAD,
  `'use strict';
const fs = require('node:fs');
const path = require('node:path');
const write = fs.writeFileSync;
const target = path.resolve(process.env.FIXTURE_WRITE_TARGET);
fs.writeFileSync = function (file, data, ...args) {
  if (typeof file !== 'number' && path.resolve(String(file)) === target) {
    write.call(fs, file, Buffer.from(String(data)).subarray(0, ${PREFIX_BYTES}));
    process.stderr.write('${MARKER}\\n');
    throw Object.assign(new Error('fixture write failure'), { code: 'ENOSPC' });
  }
  return write.call(fs, file, data, ...args);
};
`,
);

const finds = edits => edits.map(edit => edit.find).join('\n');
const PATCHERS = [
  ['patch-baileys-appstate.js', '@whiskeysockets/baileys/lib/Socket/chats.js', m => m.LOOP_FIND],
  ['patch-baileys-newsletter-create.js', '@whiskeysockets/baileys/lib/Socket/newsletter.js', m => m.PARSE_FIND],
  [
    'patch-wwebjs-block.js',
    'whatsapp-web.js/src/structures/Contact.js',
    m => m.GROUPS.map(group => group.find).join('\n'),
  ],
  ['patch-wwebjs-group-description.js', 'whatsapp-web.js/src/structures/GroupChat.js', m => m.POSITIONAL_CALL],
  ['patch-wwebjs-media-id.js', 'whatsapp-web.js/src/util/Injected/Utils.js', m => m.ANCHOR],
  ['patch-wwebjs-newsletter-preview.js', 'whatsapp-web.js/src/util/Injected/Utils.js', m => m.LEGACY_CALL],
  [
    'patch-wwebjs-participant-arity.js',
    'whatsapp-web.js/src/structures/GroupChat.js',
    m => finds(m.GROUPS.flatMap(group => group.edits)),
  ],
  ['patch-wwebjs-ready-sync.js', 'whatsapp-web.js/src/Client.js', m => finds(m.EDITS)],
  ['patch-wwebjs-send-error.js', 'whatsapp-web.js/src/Client.js', m => m.ANCHOR],
  [
    'patch-wwebjs-status.js',
    'whatsapp-web.js/src/util/Injected/Utils.js',
    m => finds(m.GROUPS.flatMap(group => group.edits)),
  ],
];

function fixture(name, relative, content) {
  const root = fs.mkdtempSync(path.join(WORK, 'tree-'));
  const script = path.join(root, 'scripts', name);
  const target = path.join(root, 'node_modules', relative);
  fs.mkdirSync(path.dirname(script), { recursive: true });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(__dirname, name), script);
  fs.writeFileSync(target, content);
  return { root, script, target };
}

function patch({ root, script, target }, fault) {
  const result = spawnSync(process.execPath, [...(fault ? ['--require', PRELOAD] : []), script, '--best-effort'], {
    cwd: root,
    env: { PATH: process.env.PATH, FIXTURE_WRITE_TARGET: target },
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.equal(result.error, undefined);
  return result;
}

for (const [name, relative, shapeOf] of PATCHERS) {
  const shape = `// fixture\n${shapeOf(require(`./${name}`))}\n`;

  test(`${name} patches a recognised tree`, () => {
    const tree = fixture(name, relative, shape);
    assert.equal(patch(tree).status, 0);
    assert.notEqual(fs.readFileSync(tree.target, 'utf8'), shape);
  });

  test(`${name} skips an unrecognised tree under --best-effort`, () => {
    const tree = fixture(name, relative, 'unknown source shape\n');
    assert.equal(patch(tree).status, 0);
    assert.equal(fs.readFileSync(tree.target, 'utf8'), 'unknown source shape\n');
  });

  test(`${name} fails when the write breaks part-way, even under --best-effort`, () => {
    const tree = fixture(name, relative, shape);
    const result = patch(tree, true);
    assert.match(result.stderr, new RegExp(MARKER), 'the injected fault did not fire');
    assert.equal(fs.statSync(tree.target).size, PREFIX_BYTES, 'the target keeps only the written prefix');
    assert.notEqual(result.status, 0);
  });
}
