import { DynamicModule, Module } from '@nestjs/common';
import { EuTrustedListAdapter } from './eu-trusted-list.adapter';
import {
  EU_TRUSTED_LIST_OPTIONS,
  EuTrustedListAdapterOptions,
} from './eu-trusted-list.options';

/**
 * Registers the EU Trusted List adapter. With no options it answers for the
 * EU LoTL (https://ec.europa.eu/tools/lotl/eu-lotl.xml) and every national
 * trusted list it points to.
 */
@Module({})
export class EuTrustedListAdapterModule {
  static forRoot(options: EuTrustedListAdapterOptions = {}): DynamicModule {
    return {
      module: EuTrustedListAdapterModule,
      providers: [
        { provide: EU_TRUSTED_LIST_OPTIONS, useValue: options },
        EuTrustedListAdapter,
      ],
      exports: [EuTrustedListAdapter],
    };
  }
}
