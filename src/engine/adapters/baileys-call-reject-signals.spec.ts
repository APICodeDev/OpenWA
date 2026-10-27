import type { WACallEvent, WASocket } from '@whiskeysockets/baileys';
import type { CallOutcomeEvent } from '../interfaces/whatsapp-engine.interface';
import { CallNotFoundError } from '../../common/errors/call-not-found.error';
import { BaileysEvents, BaileysEventsHost } from './baileys-events';

const CALL_ID = 'CALL1';
const CALLER = '628111@s.whatsapp.net';
const call = (status: string, from = CALLER): WACallEvent =>
  ({ id: CALL_ID, from, chatId: from, status, offline: false, date: new Date() }) as unknown as WACallEvent;

function setup() {
  const outcomes: CallOutcomeEvent[] = [];
  let settle!: { resolve: () => void; reject: (error: Error) => void };
  const socket = {
    rejectCall: jest.fn(
      () =>
        new Promise<void>((resolve, reject) => {
          settle = { resolve, reject };
        }),
    ),
  } as unknown as WASocket;
  const host = {
    logger: { debug: () => undefined, warn: () => undefined },
    normalizedSelfJid: () => '99999@s.whatsapp.net',
    toNeutralJid: (jid: string) => jid,
    getSocketOrNull: () => socket,
    getOnCall: () => () => undefined,
    getOnCallOutcome: () => (outcome: CallOutcomeEvent) => outcomes.push(outcome),
  } as unknown as BaileysEventsHost;
  const events = new BaileysEvents(host);
  events.handleCallEvents([call('offer')]);
  return { events, outcomes, socket, settle: () => settle };
}

describe('a call signal that arrives while its rejection is pending', () => {
  it.each([
    ['accept', 'accepted'],
    ['reject', 'rejected'],
    ['timeout', 'missed'],
  ])('is published as %s, and the later answer adds nothing', async (status, outcome) => {
    const { events, outcomes, settle } = setup();
    const attempt = events.rejectCall(CALL_ID);

    events.handleCallEvents([call(status)]);
    settle().resolve();
    await attempt;

    expect(outcomes).toEqual([expect.objectContaining({ callId: CALL_ID, outcome })]);
  });

  it.each(['accept', 'timeout', 'terminate'])(
    'leaves the call gone when %s ended it and the rejection then fails',
    async status => {
      const { events, settle } = setup();
      const attempt = events.rejectCall(CALL_ID);

      events.handleCallEvents([call(status)]);
      settle().reject(new Error('Connection Closed'));
      await expect(attempt).rejects.toThrow('Connection Closed');

      await expect(events.rejectCall(CALL_ID)).rejects.toBeInstanceOf(CallNotFoundError);
    },
  );

  it('does not report the old rejection of a call that rang again', async () => {
    const { events, outcomes, settle } = setup();
    const attempt = events.rejectCall(CALL_ID);

    events.handleCallEvents([call('offer', '628222@s.whatsapp.net')]);
    settle().resolve();
    await attempt;

    expect(outcomes).toEqual([]);
  });

  it('still reports its own success when nothing else happened', async () => {
    const { events, outcomes, settle } = setup();
    const attempt = events.rejectCall(CALL_ID);

    settle().resolve();
    await attempt;

    expect(outcomes).toEqual([expect.objectContaining({ callId: CALL_ID, outcome: 'rejected' })]);
  });

  it('keeps the call rejectable after a plain failure', async () => {
    const { events, settle } = setup();
    const attempt = events.rejectCall(CALL_ID);

    settle().reject(new Error('Connection Closed'));
    await expect(attempt).rejects.toThrow('Connection Closed');
    const retry = events.rejectCall(CALL_ID);
    settle().resolve();

    await expect(retry).resolves.toBeUndefined();
  });
});
