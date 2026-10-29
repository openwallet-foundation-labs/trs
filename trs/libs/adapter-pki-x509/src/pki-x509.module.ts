import { DynamicModule, Module } from '@nestjs/common';
import { PkiX509Adapter } from './pki-x509.adapter';
import { PKI_X509_OPTIONS, PkiX509AdapterOptions } from './pki-x509.options';

@Module({})
export class PkiX509AdapterModule {
  static forRoot(options: PkiX509AdapterOptions = {}): DynamicModule {
    return {
      module: PkiX509AdapterModule,
      providers: [
        { provide: PKI_X509_OPTIONS, useValue: options },
        PkiX509Adapter,
      ],
      exports: [PkiX509Adapter],
    };
  }
}
