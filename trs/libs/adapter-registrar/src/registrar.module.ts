import { DynamicModule, Module } from '@nestjs/common';
import type { RegistrarConfig } from './registrar.client';
import { REGISTRAR_CONFIG, RegistrarAdapter } from './registrar.adapter';

/** Registers the registrar adapter for one relying-party registrar. */
@Module({})
export class RegistrarAdapterModule {
  static forRoot(config: RegistrarConfig): DynamicModule {
    return {
      module: RegistrarAdapterModule,
      providers: [{ provide: REGISTRAR_CONFIG, useValue: config }, RegistrarAdapter],
      exports: [RegistrarAdapter],
    };
  }
}
