import { Module } from '@nestjs/common';
import { DidWebAdapterModule } from '@app/adapter-did-web';

/**
 * Trust-protocol adapter registration — the single place contributors touch.
 *
 * To add an adapter: build it as a `libs/adapter-*` module and add that module
 * to `imports` below. The AdapterRegistry auto-discovers it (order-based
 * first-match); nothing else in the resolver changes.
 */
@Module({
  imports: [
    DidWebAdapterModule,
    // 👇 add new adapter modules here — e.g. DidWebvhAdapterModule (#18),
    //    OpenIdFederationAdapterModule (#20), PkiX509AdapterModule (#21) …
  ],
})
export class AdaptersModule {}
