import { Controller, Get } from '@nestjs/common';

/** Liveness probe for container orchestrators and load balancers. */
@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { status: 'ok' };
  }
}
