import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsObject } from 'class-validator';

export class AuthorizationRequestDto {
  @ApiProperty({
    description: 'Entity identifier to check authorization for',
    example: 'did:example:123456789abcdefghi',
  })
  @IsString()
  entity_id: string;

  @ApiProperty({
    description: 'Assertion identifier to check authorization for',
    example: 'assertion:example:abc123',
  })
  @IsString()
  assertion_id: string;

  @ApiPropertyOptional({
    description: 'Specific authority identifier (optional)',
    example: 'did:example:authority123',
  })
  @IsOptional()
  @IsString()
  authority_id?: string;

  @ApiPropertyOptional({
    description: 'Additional context for authorization request',
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

export class AuthorizationResponseDto {
  @ApiProperty({
    description: 'Whether the entity is authorized',
    example: true,
  })
  authorized: boolean;

  @ApiProperty({
    description: 'Authorization result metadata',
    example: {
      timestamp: '2024-01-01T00:00:00Z',
      authority: 'did:example:authority123',
      assertion: 'assertion:example:abc123',
      expires_at: '2024-12-31T23:59:59Z',
    },
  })
  metadata: {
    timestamp: string;
    authority?: string;
    assertion?: string;
    expires_at?: string;
    [key: string]: string;
  };
}
