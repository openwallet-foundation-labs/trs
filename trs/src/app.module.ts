import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ResolverModule } from '@/resolver/resolver.module';
import { RegistryModule } from '@/registry/registry.module';

@Module({
  imports: [ResolverModule, RegistryModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
