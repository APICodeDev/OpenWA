import { ConflictException } from '@nestjs/common';
import { Not } from 'typeorm';
import { SessionService } from './session.service';
import { EngineRegistry } from '../../engine/engine-registry.service';
import { Session, SessionStatus } from './entities/session.entity';

const ID = '11111111-1111-4111-8111-111111111111';
const OTHER_PHONE = '628111000111';

function fixture(holderExists: boolean, ownPhone: string | null = null) {
  const row = { id: ID, name: 'pairing', status: SessionStatus.QR_READY, phone: ownPhone, config: {} } as Session;
  const repository = {
    findOne: jest.fn().mockResolvedValue(row),
    exists: jest.fn().mockResolvedValue(holderExists),
  };
  const state = { attachTo: <T>(value: T): T => value };
  const engine = { requestPairingCode: jest.fn().mockResolvedValue('ABCD1234') };
  const registry = new EngineRegistry();
  registry.set(ID, engine as never);
  const service = new SessionService(
    repository as never,
    {} as never,
    {} as never,
    registry,
    {} as never,
    state as never,
    state as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, repository, engine };
}

describe('SessionService.requestPairingCode', () => {
  it('refuses a number another session of the gateway is linked with, without asking WhatsApp', async () => {
    const { service, repository, engine } = fixture(true);

    await expect(service.requestPairingCode(ID, OTHER_PHONE)).rejects.toBeInstanceOf(ConflictException);

    expect(repository.exists).toHaveBeenCalledWith({ where: { phone: OTHER_PHONE, id: Not(ID) } });
    expect(engine.requestPairingCode).not.toHaveBeenCalled();
  });

  it('asks for a code for a number no other session holds, including the session own number', async () => {
    const { service, engine } = fixture(false, OTHER_PHONE);

    await expect(service.requestPairingCode(ID, OTHER_PHONE)).resolves.toEqual({
      pairingCode: 'ABCD1234',
      status: SessionStatus.QR_READY,
    });

    expect(engine.requestPairingCode).toHaveBeenCalledWith(OTHER_PHONE);
  });
});
