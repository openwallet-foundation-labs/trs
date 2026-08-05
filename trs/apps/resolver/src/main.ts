import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { ProblemDetailsFilter } from './trqp/problem-details.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
  app.useGlobalFilters(new ProblemDetailsFilter());
  await app.listen(3000, '0.0.0.0');
}
bootstrap();
