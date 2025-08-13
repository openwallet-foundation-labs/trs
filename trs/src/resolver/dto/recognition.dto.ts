import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class RecognitionRequestDto {
  @ApiProperty({
    description: 'Authority identifier for the Trust Registry',
    example: 'https://trust-registry.example.com',
  })
  @IsString()
  authority_id: string;

  @ApiProperty({
    description: 'Entity identifier to be recognized',
    example: 'https://entity.example.com',
  })
  @IsString()
  entity_id: string;

  @ApiPropertyOptional({
    description: 'Scope for the recognition request',
    example: 'financial-services',
  })
  @IsOptional()
  @IsString()
  scope?: string;

  @ApiPropertyOptional({
    description: 'Time for the recognition request in ISO 8601 format',
    example: '2025-01-01T00:00:00Z',
  })
  @IsOptional()
  @IsString()
  time?: string;
}

export class RecognitionResponseDto {
  @ApiProperty({
    description: 'Whether the entity was recognized',
    example: true,
  })
  recognized: boolean;

  @ApiPropertyOptional({
    description: 'Recognition result metadata',
    example: {
      timestamp: '2025-01-01T00:00:00Z',
    },
  })
  metadata?: {
    timestamp: string;
    [key: string]: any;
  };
}
