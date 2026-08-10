import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { AdapterRegistry } from './adapter.registry';

/** Provides the AdapterRegistry. DiscoveryModule enables provider scanning. */
@Module({
  imports: [DiscoveryModule],
  providers: [AdapterRegistry],
  exports: [AdapterRegistry],
})
export class AdapterKitModule {}
