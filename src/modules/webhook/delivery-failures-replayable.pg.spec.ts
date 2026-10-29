import { randomBytes, randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { DataSource, Repository } from 'typeorm';
import { Session } from '../session/entities/session.entity';
import { Webhook } from './entities/webhook.entity';
import { WebhookDeliveryFailure } from './entities/webhook-delivery-failure.entity';
import { WebhookService } from './webhook.service';

const describePostgres = process.env.DATABASE_TYPE === 'postgres' ? describe : describe.skip;

// The replayable flag on PostgreSQL: a row of a deleted webhook, or of a webhook in another session, reads false; a
// row of a disabled webhook keeps true, since switching the webhook back lets the redrive take it.
describePostgres('delivery-failure replayable flag on PostgreSQL', () => {
  let admin: DataSource;
  let ds: DataSource;
  let failures: Repository<WebhookDeliveryFailure>;
  let webhooks: Repository<Webhook>;
  let listing: WebhookService;
  let sessionId: string;
  const schema = `replayable_${process.pid}_${randomBytes(4).toString('hex')}`;
  const config = new ConfigService({ webhook: { failurePayloadRetentionHours: 24 } });

  beforeAll(async () => {
    const options = {
      type: 'postgres' as const,
      host: process.env.DATABASE_HOST || 'localhost',
      port: Number(process.env.DATABASE_PORT || 5432),
      username: process.env.DATABASE_USERNAME || 'openwa',
      password: process.env.DATABASE_PASSWORD || 'openwa',
      database: process.env.DATABASE_NAME || 'openwa',
    };
    admin = await new DataSource(options).initialize();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    ds = await new DataSource({
      ...options,
      schema,
      extra: { options: `-c search_path=${schema},public` },
      entities: [Session, Webhook, WebhookDeliveryFailure],
      synchronize: true,
    }).initialize();
    failures = ds.getRepository(WebhookDeliveryFailure);
    webhooks = ds.getRepository(Webhook);
    listing = new WebhookService(webhooks, failures, {} as never, config, {} as never);
    sessionId = (await ds.getRepository(Session).save({ name: schema })).id;
  });
  afterAll(async () => {
    if (ds?.isInitialized) await ds.destroy();
    if (admin?.isInitialized) {
      await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      await admin.destroy();
    }
  });

  const addFailure = (webhookId: string, rowSession = sessionId): Promise<WebhookDeliveryFailure> =>
    failures.save(
      failures.create({
        webhookId,
        sessionId: rowSession,
        event: 'message.received',
        url: 'https://receiver.example/h',
        idempotencyKey: randomUUID(),
        attempts: 3,
        lastError: 'HTTP 503: unavailable',
        payload: { id: 'msg-1' },
      }),
    );

  it('reads false for a deleted webhook or another session, and true for a disabled one', async () => {
    const save = () => webhooks.save({ sessionId, url: 'https://receiver.example/h', events: ['message.received'] });
    const [kept, disabled, deleted] = [await save(), await save(), await save()];
    await webhooks.update(disabled.id, { active: false });
    const rows = {
      kept: await addFailure(kept.id),
      disabled: await addFailure(disabled.id),
      deleted: await addFailure(deleted.id),
      foreign: await addFailure(kept.id, randomUUID()),
    };
    await webhooks.delete(deleted.id);

    const flags = new Map((await listing.listDeliveryFailures({}, null)).map(r => [r.id, r.replayable]));

    expect(flags.get(rows.kept.id)).toBe(true);
    expect(flags.get(rows.disabled.id)).toBe(true);
    expect(flags.get(rows.deleted.id)).toBe(false);
    expect(flags.get(rows.foreign.id)).toBe(false);
  });
});
