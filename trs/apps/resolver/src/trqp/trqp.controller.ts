import { Body, Controller, HttpCode, Post, UsePipes } from '@nestjs/common';
import {
  AuthorizationQuery,
  RecognitionQuery,
  type AuthorizationQuery as AuthorizationQueryDto,
  type RecognitionQuery as RecognitionQueryDto,
} from '@trs/trqp-core';
import { ResolverService } from '../resolver/resolver.service';
import { ZodValidationPipe } from './zod-validation.pipe';

/** TRQP v2.0 HTTPS binding: authorization + recognition queries. */
@Controller()
export class TrqpController {
  constructor(private readonly resolver: ResolverService) {}

  @Post('authorization')
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(AuthorizationQuery))
  authorize(@Body() body: AuthorizationQueryDto) {
    return this.resolver.authorize(body);
  }

  @Post('recognition')
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(RecognitionQuery))
  recognize(@Body() body: RecognitionQueryDto) {
    return this.resolver.recognize(body);
  }
}
