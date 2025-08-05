/**
 * TRQP (Trust Registry Query Protocol) Standard Types
 * Based on TRQP specification for Trust Registry interactions
 */

export interface AuthorityStatement {
  authority_id: string;
  entity_id: string;
  assertion_id: string;
  context: {
    time: string;
    [key: string]: string;
  };
}

export interface RecognitionRequest {
  entity_id: string;
  authority_id?: string;
  context?: {
    time?: string;
    [key: string]: string;
  };
}

export interface AuthorizationRequest {
  entity_id: string;
  assertion_id: string;
  authority_id?: string;
  context?: {
    time?: string;
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

export interface ResolutionRequest {
  type: 'recognition' | 'authorization';
  entity_id: string;
  assertion_id?: string;
  authority_id?: string;
  context?: {
    time?: string;
    ecosystem?: string;
    [key: string]: string;
  };
}

export interface ResolutionResponse {
  resolved: boolean;
  result: {
    recognized?: boolean;
    authorized?: boolean;
  };
  resolution_path: {
    trs_endpoint: string;
    response: TrustRegistryResponse;
  }[];
  delegation_chains?: string[];
  metadata: {
    timestamp: string;
    resolver_version: string;
    total_queries: number;
  };
}

export interface TrustAnchorInfo {
  ecosystem: string;
  trs_endpoints: string[];
  metadata?: {
    [key: string]: string;
  };
}
