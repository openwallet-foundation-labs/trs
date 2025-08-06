import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsIn, IsObject } from 'class-validator';

export interface AuthorityStatement {
  authority_id: string;
  entity_id: string;
  assertion_id: string;
  context: {
    time: string;
    [key: string]: string;
  };
}

export interface TrustRegistryResponse {
  recognized: boolean;
  authorized?: boolean;
  authority_statements?: AuthorityStatement[];
  delegation_chain?: string[];
  metadata?: {
    timestamp: string;
    trs_endpoint: string;
    [key: string]: string;
  };
}

export class ResolutionRequestDto {
  @ApiProperty({
    description: 'Type of resolution request',
    enum: ['recognition', 'authorization'],
    example: 'recognition',
  })
  @IsString()
  @IsIn(['recognition', 'authorization'])
  type: 'recognition' | 'authorization';

  @ApiProperty({
    description: 'Entity identifier to resolve',
    example: 'did:example:123456789abcdefghi',
  })
  @IsString()
  entity_id: string;

  @ApiPropertyOptional({
    description: 'Assertion identifier for authorization requests',
    example: 'assertion:example:abc123',
  })
  @IsOptional()
  @IsString()
  assertion_id?: string;

  @ApiPropertyOptional({
    description: 'Authority identifier to query specifically',
    example: 'did:example:authority123',
  })
  @IsOptional()
  @IsString()
  authority_id?: string;

  @ApiPropertyOptional({
    description: 'Additional context for the resolution request',
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

export class ResolutionResponseDto {
  @ApiProperty({
    description: 'Whether the resolution was successful',
    example: true,
  })
  resolved: boolean;

  @ApiProperty({
    description: 'Resolution result details',
    example: {
      recognized: true,
      authorized: false,
    },
  })
  result: {
    recognized?: boolean;
    authorized?: boolean;
  };

  @ApiProperty({
    description: 'Path of TRS queries made during resolution',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        trs_endpoint: { type: 'string' },
        response: { type: 'object' },
      },
    },
  })
  resolution_path: {
    trs_endpoint: string;
    response: TrustRegistryResponse;
  }[];

  @ApiPropertyOptional({
    description: 'Delegation chains found during resolution',
    type: [String],
  })
  delegation_chains?: string[];

  @ApiProperty({
    description: 'Additional metadata about the resolution',
    example: {
      timestamp: '2024-01-01T00:00:00Z',
      duration_ms: 150,
    },
  })
  metadata: {
    timestamp: string;
    duration_ms: string;
    [key: string]: string;
  };
}
