import { HookManager } from './hook-manager.service';

describe('HookManager registration handles', () => {
  afterEach(() => jest.restoreAllMocks());

  it('gives registrations made in the same millisecond separate handles', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1234);
    const manager = new HookManager();
    const seen: string[] = [];
    const first = manager.register('plugin', 'message:received', () => {
      seen.push('first');
      return Promise.resolve({ continue: true });
    });
    const second = manager.register('plugin', 'message:received', () => {
      seen.push('second');
      return Promise.resolve({ continue: true });
    });
    expect(first).not.toBe(second);

    manager.setPriority(second, 1);
    await manager.execute('message:received', {}, { source: 'test' });
    expect(seen).toEqual(['second', 'first']);

    manager.unregister(second);
    seen.length = 0;
    await manager.execute('message:received', {}, { source: 'test' });
    expect(seen).toEqual(['first']);
  });
});
