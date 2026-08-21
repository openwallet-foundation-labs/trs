import { DynamicModule, Module } from '@nestjs/common';
import type { TrustedListConfig } from './lote';
import { TRUSTED_LIST_CONFIG, TrustedListAdapter } from './trusted-list.adapter';

/** Registers the Trusted List adapter for one Scheme Operator. */
@Module({})
export class TrustedListAdapterModule {
  static forRoot(config: TrustedListConfig): DynamicModule {
    return {
      module: TrustedListAdapterModule,
      providers: [{ provide: TRUSTED_LIST_CONFIG, useValue: config }, TrustedListAdapter],
      exports: [TrustedListAdapter],
    };
  }
}
