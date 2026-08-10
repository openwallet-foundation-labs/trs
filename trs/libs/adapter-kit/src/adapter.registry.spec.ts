import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  AdapterKitModule,
  AdapterRegistry,
  NoAdapterError,
  RoutingUnavailableError,
  TrustAdapter,
} from './index';

@TrustAdapter('low', { order: 10 })
class LowAdapter {
  readonly id = 'low';
  async canHandle(a: string) {
    return a.startsWith('low:');
  }
  async resolveAuthorization() {
    return { authorized: true };
  }
  async resolveRecognition() {
    return { recognized: true };
  }
}

@TrustAdapter('high', { order: 50 })
class HighAdapter {
  readonly id = 'high';
  async canHandle(a: string) {
    return a.startsWith('low:') || a.startsWith('high:');
  }
  async resolveAuthorization() {
    return { authorized: false };
  }
  async resolveRecognition() {
    return { recognized: false };
  }
}

@TrustAdapter('boom', { order: 5 })
class BoomAdapter {
  readonly id = 'boom';
  async canHandle(a: string) {
    if (a.startsWith('boom:')) throw new Error('network');
    return false;
  }
  async resolveAuthorization() {
    return { authorized: false };
  }
  async resolveRecognition() {
    return { recognized: false };
  }
}

describe('AdapterRegistry (order-based first-match)', () => {
  let app: INestApplication;
  let reg: AdapterRegistry;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AdapterKitModule],
      providers: [LowAdapter, HighAdapter, BoomAdapter],
    }).compile();
    app = mod.createNestApplication();
    await app.init();
    reg = app.get(AdapterRegistry);
  });

  afterAll(async () => {
    await app.close();
  });

  it('sorts adapters by order (boom:5, low:10, high:50)', () => {
    expect(reg.list().map((a) => a.id)).toEqual(['boom', 'low', 'high']);
  });

  it('first-match: "low:" handled by low (order 10), short-circuiting high (order 50)', async () => {
    expect((await reg.select('low:x')).id).toBe('low');
  });

  it('routes "high:" to high', async () => {
    expect((await reg.select('high:y')).id).toBe('high');
  });

  it('no match → NoAdapterError (404)', async () => {
    await expect(reg.select('nope:z')).rejects.toBeInstanceOf(NoAdapterError);
  });

  it('canHandle throws + no other match → RoutingUnavailableError (503)', async () => {
    await expect(reg.select('boom:q')).rejects.toBeInstanceOf(RoutingUnavailableError);
  });
});
