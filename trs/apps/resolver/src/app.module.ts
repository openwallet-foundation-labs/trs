import { Module } from '@nestjs/common';
import { AdapterKitModule } from '@app/adapter-kit';
import { CacheModule } from '@app/cache';
import { AdaptersModule } from './adapters/adapters.module';
import { TrqpController } from './trqp/trqp.controller';
import { ResolverService } from './resolver/resolver.service';

/**
 * Core wiring only. Trust-protocol adapters live in AdaptersModule — keep them
 * out of here so contributors have one obvious place to register an adapter.
 */
@Module({
  imports: [AdapterKitModule, CacheModule, AdaptersModule],
  controllers: [TrqpController],
  providers: [ResolverService],
})
export class AppModule {}
