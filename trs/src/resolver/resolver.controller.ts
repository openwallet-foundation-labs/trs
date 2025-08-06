import {
  Controller,
  Post,
  Body,
  HttpStatus,
  HttpCode,
  Get,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import {
  RecognitionRequestDto,
  RecognitionResponseDto,
} from './dto/recognition.dto';
import {
  AuthorizationRequestDto,
  AuthorizationResponseDto,
} from './dto/authorization.dto';

@ApiTags('TRQP Resolver')
@Controller('resolver')
export class ResolverController {
  constructor() {}

  @Post('recognition')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Entity Recognition',
    description:
      'Check if a specific entity is recognized by Trust Registry Services',
  })
  @ApiBody({ type: RecognitionRequestDto })
  @ApiResponse({
    status: 200,
    description: 'Recognition check completed successfully',
    type: RecognitionResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request parameters',
  })
  async recognition(
    @Body() requestDto: RecognitionRequestDto,
  ): Promise<RecognitionResponseDto> {
    const response: RecognitionResponseDto = {
      recognized: false,
      metadata: {
        timestamp: new Date().toISOString(),
        authority: requestDto.authority_id,
      },
    };

    return response;
  }

  @Post('authorization')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Entity Authorization',
    description:
      'Check if a specific entity is authorized for given assertions by Trust Registry Services',
  })
  @ApiBody({ type: AuthorizationRequestDto })
  @ApiResponse({
    status: 200,
    description: 'Authorization check completed successfully',
    type: AuthorizationResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request parameters',
  })
  async authorization(
    @Body() requestDto: AuthorizationRequestDto,
  ): Promise<AuthorizationResponseDto> {
    const response: AuthorizationResponseDto = {
      authorized: false,
      metadata: {
        timestamp: new Date().toISOString(),
        authority: requestDto.authority_id,
        assertion: requestDto.assertion_id,
      },
    };

    return response;
  }

  @Get('health')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Health check',
    description:
      'Check if resolver service is healthy and can connect to TRS endpoints',
  })
  @ApiResponse({
    status: 200,
    description: 'Service is healthy',
  })
  async healthCheck(): Promise<{
    status: string;
    timestamp: string;
    version: string;
  }> {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    };
  }
}
