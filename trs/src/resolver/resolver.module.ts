import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ResolverController } from '@/resolver/resolver.controller';
import { RegistryModule } from '@/registry/registry.module';
import { TrsService } from './services/trs.service';

@Module({
  imports: [RegistryModule, HttpModule],
  controllers: [ResolverController],
  providers: [TrsService],
  exports: [TrsService],
})
export class ResolverModule {}
