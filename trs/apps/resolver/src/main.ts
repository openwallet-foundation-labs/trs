import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { ProblemDetailsFilter } from './trqp/problem-details.filter';
import { serverConfigFromEnv } from './server.env';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );
  app.useGlobalFilters(new ProblemDetailsFilter());
  const { port, host } = serverConfigFromEnv();
  await app.listen(port, host);
}
bootstrap();
