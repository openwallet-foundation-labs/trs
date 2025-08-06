import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsObject } from 'class-validator';

export class RecognitionRequestDto {
  @ApiProperty({
    description: 'Entity identifier to be recognized',
    example: 'did:example:123456789abcdefghi',
  })
  @IsString()
  entity_id: string;

  @ApiPropertyOptional({
    description: 'Specific authority identifier (optional)',
    example: 'did:example:authority123',
  })
  @IsOptional()
  @IsString()
  authority_id?: string;

  @ApiPropertyOptional({
    description: 'Additional context for recognition request',
    example: {
      time: '2024-01-01T00:00:00Z',
      ecosystem: 'example-ecosystem',
    },
  })
  @IsOptional()
  @IsObject()
  context?: {
    time?: string;
    ecosystem?: string;
    [key: string]: string;
  };
}

export class RecognitionResponseDto {
  @ApiProperty({
    description: 'Whether the entity was recognized',
    example: true,
  })
  recognized: boolean;

  @ApiProperty({
    description: 'Recognition result metadata',
    example: {
      timestamp: '2024-01-01T00:00:00Z',
      authority: 'did:example:authority123',
      confidence: 0.95,
    },
  })
  metadata: {
    timestamp: string;
    authority?: string;
    confidence?: string;
    [key: string]: string;
  };
}
