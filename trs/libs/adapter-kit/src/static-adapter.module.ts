import { DynamicModule, Module } from '@nestjs/common';
import { StaticAdapter, StaticAdapterConfig, STATIC_ADAPTER_CONFIG } from './static-adapter';

/** Registers the reference StaticAdapter with a caller-supplied config. */
@Module({})
export class StaticAdapterModule {
  static forRoot(config: StaticAdapterConfig): DynamicModule {
    return {
      module: StaticAdapterModule,
      providers: [{ provide: STATIC_ADAPTER_CONFIG, useValue: config }, StaticAdapter],
      exports: [StaticAdapter],
    };
  }
}
