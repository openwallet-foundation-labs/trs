import { Module } from '@nestjs/common';
import { ResolverController } from '@/resolver/resolver.controller';
import { RegistryModule } from '@/registry/registry.module';

@Module({
  imports: [RegistryModule],
  controllers: [ResolverController],
  providers: [],
  exports: [],
})
export class ResolverModule {}
