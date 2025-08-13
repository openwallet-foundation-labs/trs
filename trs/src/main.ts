import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const config = new DocumentBuilder()
    .setTitle('TRS API')
    .setDescription('Trust Resolution Service API')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  await app.listen(8080);
  console.log(`TRS server is running on: http://localhost:8080`);
  console.log(`Swagger documentation available at: http://localhost:8080/api`);
}
bootstrap();
