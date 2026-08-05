import { Module } from '@nestjs/common';
import { DidWebAdapter } from './did-web.adapter';

/** Registers the did:web adapter. Imported by the resolver's AdaptersModule. */
@Module({
  providers: [DidWebAdapter],
  exports: [DidWebAdapter],
})
export class DidWebAdapterModule {}
