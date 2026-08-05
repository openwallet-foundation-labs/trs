import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { StaticAdapterModule } from '@app/adapter-kit';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ProblemDetailsFilter } from '../src/trqp/problem-details.filter';

describe('TRQP e2e (routing → adapter → response)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [
        AppModule,
        // The reference StaticAdapter is NOT part of production wiring; the e2e
        // suite registers it here (auto-discovered) to exercise routing +
        // order-based first-match against the real did:web adapter.
        StaticAdapterModule.forRoot({
          entries: {
            'https://acme.example/trust': { authorized: true, recognized: true },
            'did:web:conflict.example': { authorized: false, recognized: false },
          },
        }),
      ],
    }).compile();
    app = mod.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();
    // Fastify registers routes lazily; wait until it's ready before supertest hits the server.
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  const authorize = (body: Record<string, unknown>) =>
    request(app.getHttpServer()).post('/authorization').send(body);

  it('routes a did:web authority → authorized 200 with echoed params', async () => {
    const res = await authorize({
      entity_id: 'did:web:issuer',
      authority_id: 'did:web:root.example',
      action: 'issue',
      resource: 'license',
    });
    expect(res.status).toBe(200);
    expect(res.body.authorized).toBe(true);
    expect(res.body.authority_id).toBe('did:web:root.example');
    expect(res.body.action).toBe('issue');
    expect(typeof res.body.time_evaluated).toBe('string');
    expect(res.body.message).toContain('did:web');
  });

  it('first-match: did:web:conflict.example handled by did:web (order 10), not static (order 50)', async () => {
    // static config declares authorized:false for this authority; did:web stub returns true.
    const res = await authorize({
      entity_id: 'x',
      authority_id: 'did:web:conflict.example',
      action: 'a',
      resource: 'r',
    });
    expect(res.body.authorized).toBe(true); // proves did:web won the race
  });

  it('routes a static authority → static decision', async () => {
    const res = await authorize({
      entity_id: 'x',
      authority_id: 'https://acme.example/trust',
      action: 'a',
      resource: 'r',
    });
    expect(res.status).toBe(200);
    expect(res.body.authorized).toBe(true);
    expect(res.body.message).toBe('static decision');
  });

  it('unknown authority → 404 application/problem+json', async () => {
    const res = await authorize({
      entity_id: 'x',
      authority_id: 'ftp://nope.example',
      action: 'a',
      resource: 'r',
    });
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body.status).toBe(404);
    expect(res.body.title).toBe('NoAdapterError');
  });

  it('invalid body → 400 application/problem+json', async () => {
    const res = await authorize({ entity_id: 'x' });
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body.status).toBe(400);
    expect(res.body.errors).toBeDefined();
  });

  it('recognition endpoint resolves via static adapter', async () => {
    const res = await request(app.getHttpServer())
      .post('/recognition')
      .send({
        entity_id: 'https://acme.example/trust',
        authority_id: 'https://acme.example/trust',
        action: 'a',
        resource: 'r',
      });
    expect(res.status).toBe(200);
    expect(res.body.recognized).toBe(true);
  });
});
