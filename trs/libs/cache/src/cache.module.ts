import { Module } from '@nestjs/common';
import { cacheOptionsFromEnv } from './cache.env';
import { CACHE_OPTIONS, CacheService } from './cache.service';

@Module({
  providers: [
    { provide: CACHE_OPTIONS, useFactory: () => cacheOptionsFromEnv() },
    CacheService,
  ],
  exports: [CacheService],
})
export class CacheModule {}
