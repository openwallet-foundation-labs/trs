import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class AuthorizationRequestDto {
  @ApiProperty({
    description: 'Authority identifier for the Trust Registry',
    example: 'https://trust-registry.example.com',
  })
  @IsString()
  authority_id: string;

  @ApiProperty({
    description: 'Entity identifier to check authorization for',
    example: 'https://entity.example.com',
  })
  @IsString()
  entity_id: string;

  @ApiProperty({
    description: 'Assertion identifier to check authorization for',
    example: 'credential_issuer',
  })
  @IsString()
  assertion_id: string;

  @ApiPropertyOptional({
    description: 'Scope for the authorization request',
    example: 'financial-services',
  })
  @IsOptional()
  @IsString()
  scope?: string;

  @ApiPropertyOptional({
    description: 'Time for the authorization request in ISO 8601 format',
    example: '2025-01-01T00:00:00Z',
  })
  @IsOptional()
  @IsString()
  time?: string;
}

export class AuthorizationResponseDto {
  @ApiProperty({
    description: 'Whether the entity is authorized',
    example: true,
  })
  authorized: boolean;

  @ApiPropertyOptional({
    description: 'Authorization result metadata',
    example: {
      timestamp: '2025-01-01T00:00:00Z',
    },
  })
  metadata?: {
    timestamp: string;
    [key: string]: any;
  };
}
