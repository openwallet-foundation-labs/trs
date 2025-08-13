import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as jwt from 'jsonwebtoken';
import { JwtPayload } from 'jsonwebtoken';

export interface EntityCredential {
  iss: string;
  sub: string;
  iat: number;
  exp?: number;
  trust_marks?: string[];
  authority_hints?: string[];
  jwks?: any;
  metadata?: {
    federation_entity?: {
      federation_fetch_endpoint?: string;
      [key: string]: any;
    };
    [key: string]: any;
  };
}

export interface EntityStatement {
  iss: string;
  sub: string;
  iat: number;
  exp?: number;
  jwks?: any;
  metadata?: any;
  authority_hints?: string[];
}

export interface TrustChainValidationResult {
  isValid: boolean;
  trustAnchor?: string;
  validationPath: string[];
  errors: string[];
}

export interface TrsResolutionRequest {
  entityId: string;
  assertionId?: string;
  authorityId?: string;
  context?: Record<string, any>;
}

export interface TrsResolutionResult {
  recognized: boolean;
  authorized?: boolean;
  trustChainValid: boolean;
  metadata: {
    timestamp: string;
    validationPath: string[];
    errors: string[];
  };
}

@Injectable()
export class TrsService {
  constructor(private readonly httpService: HttpService) {}

  async resolveEntity(
    request: TrsResolutionRequest,
  ): Promise<TrsResolutionResult> {
    try {
      const ecValidation = await this.validateEntityCredential(
        request.entityId,
      );

      const esValidation =
        request.assertionId && request.authorityId
          ? await this.validateEntityStatement(
              request.authorityId,
              request.entityId,
            )
          : { isValid: true, validationPath: [], errors: [] };

      const trustChainValidation = await this.validateTrustChain(
        request.entityId,
      );

      const policyResult = this.applyPolicy(
        ecValidation,
        esValidation,
        trustChainValidation,
        request,
      );

      const result: TrsResolutionResult = {
        recognized: ecValidation.isValid,
        authorized: request.assertionId
          ? esValidation.isValid && policyResult
          : undefined,
        trustChainValid: trustChainValidation.isValid,
        metadata: {
          timestamp: new Date().toISOString(),
          validationPath: [
            ...ecValidation.validationPath,
            ...esValidation.validationPath,
            ...trustChainValidation.validationPath,
          ],
          errors: [
            ...ecValidation.errors,
            ...esValidation.errors,
            ...trustChainValidation.errors,
          ],
        },
      };

      return result;
    } catch (error) {
      return {
        recognized: false,
        authorized: false,
        trustChainValid: false,
        metadata: {
          timestamp: new Date().toISOString(),
          validationPath: [],
          errors: [`Resolution failed: ${error.message}`],
        },
      };
    }
  }

  private async validateEntityCredential(
    entityId: string,
  ): Promise<TrustChainValidationResult> {
    try {
      const ec = await this.fetchEntityCredential(entityId);

      if (!ec) {
        return {
          isValid: false,
          validationPath: [],
          errors: ['Entity Credential not found'],
        };
      }

      const isExpired = ec.exp && ec.exp < Math.floor(Date.now() / 1000);
      if (isExpired) {
        return {
          isValid: false,
          validationPath: [entityId],
          errors: ['Entity Credential expired'],
        };
      }

      const isSelfIssued = ec.iss === ec.sub;
      if (!isSelfIssued) {
        return {
          isValid: false,
          validationPath: [entityId],
          errors: [
            `Entity Credential is not self-issued (iss=${ec.iss} != sub=${ec.sub})`,
          ],
        };
      }

      return {
        isValid: true,
        validationPath: [entityId],
        errors: [],
      };
    } catch (error) {
      return {
        isValid: false,
        validationPath: [],
        errors: [`EC validation error: ${error.message}`],
      };
    }
  }

  private async validateEntityStatement(
    issuerEntityId: string,
    subjectEntityId: string,
  ): Promise<TrustChainValidationResult> {
    try {
      const es = await this.fetchEntityStatement(
        issuerEntityId,
        subjectEntityId,
      );

      if (!es) {
        return {
          isValid: false,
          validationPath: [],
          errors: ['Entity Statement not found'],
        };
      }

      const isExpired = es.exp && es.exp < Math.floor(Date.now() / 1000);
      if (isExpired) {
        return {
          isValid: false,
          validationPath: [subjectEntityId],
          errors: ['Entity Statement expired'],
        };
      }

      const isProperlyIssued =
        es.iss === issuerEntityId && es.sub === subjectEntityId;
      if (!isProperlyIssued) {
        return {
          isValid: false,
          validationPath: [subjectEntityId],
          errors: [
            `Entity Statement not properly issued (expected iss=${issuerEntityId}, sub=${subjectEntityId}, got iss=${es.iss}, sub=${es.sub})`,
          ],
        };
      }

      return {
        isValid: true,
        validationPath: [es.iss, subjectEntityId],
        errors: [],
      };
    } catch (error) {
      return {
        isValid: false,
        validationPath: [],
        errors: [`ES validation error: ${error.message}`],
      };
    }
  }

  private async validateTrustChain(
    entityId: string,
  ): Promise<TrustChainValidationResult> {
    try {
      const validationPath: string[] = [];
      const errors: string[] = [];
      let currentEntity = entityId;
      const visitedEntities = new Set<string>();

      while (currentEntity) {
        if (visitedEntities.has(currentEntity)) {
          errors.push(`Circular reference detected: ${currentEntity}`);
          break;
        }

        visitedEntities.add(currentEntity);
        validationPath.push(currentEntity);

        const ec = await this.fetchEntityCredential(currentEntity);
        if (!ec) {
          errors.push(`Entity Credential not found for: ${currentEntity}`);
          break;
        }

        if (await this.isTrustAnchor(currentEntity)) {
          return {
            isValid: true,
            trustAnchor: currentEntity,
            validationPath,
            errors,
          };
        }

        if (ec.authority_hints && ec.authority_hints.length > 0) {
          currentEntity = ec.authority_hints[0];
        } else {
          errors.push(`No authority hints found for: ${currentEntity}`);
          break;
        }
      }

      return {
        isValid: false,
        validationPath,
        errors: [...errors, 'Trust anchor not reached'],
      };
    } catch (error) {
      return {
        isValid: false,
        validationPath: [],
        errors: [`Trust chain validation error: ${error.message}`],
      };
    }
  }

  private applyPolicy(
    ecValidation: TrustChainValidationResult,
    esValidation: TrustChainValidationResult,
    trustChainValidation: TrustChainValidationResult,
    request: TrsResolutionRequest,
  ): boolean {
    if (!ecValidation.isValid) return false;

    if (request.assertionId && !esValidation.isValid) return false;

    if (!trustChainValidation.isValid) return false;

    if (
      request.context?.requireTrustAnchor &&
      !trustChainValidation.trustAnchor
    ) {
      return false;
    }

    return true;
  }

  private async fetchEntityCredential(
    entityId: string,
  ): Promise<EntityCredential | null> {
    try {
      const url = `${entityId}/.well-known/openid-federation`;
      const response = await firstValueFrom(this.httpService.get(url));

      const jwt = response.data;
      const decoded = await this.decodeAndVerifyJWT(jwt);

      return decoded;
    } catch (error) {
      return null;
    }
  }

  private async fetchEntityStatement(
    issuerEntityId: string,
    subjectEntityId: string,
  ): Promise<EntityStatement | null> {
    try {
      const issuerEC = await this.fetchEntityCredential(issuerEntityId);
      if (!issuerEC?.metadata?.federation_entity?.federation_fetch_endpoint) {
        return null;
      }

      const fetchEndpoint =
        issuerEC.metadata.federation_entity.federation_fetch_endpoint;
      const url = `${fetchEndpoint}?sub=${encodeURIComponent(subjectEntityId)}`;

      const response = await firstValueFrom(this.httpService.get(url));
      const jwt = response.data;
      const decoded = await this.decodeAndVerifyJWT(jwt);

      return decoded as EntityStatement;
    } catch (error) {
      return null;
    }
  }

  private async isTrustAnchor(entityId: string): Promise<boolean> {
    const knownTrustAnchors = [
      'https://htrust.example.com',
      'https://trust-registry.gov.kr',
      'https://trust-anchor.example.org',
      'http://localhost:3000',
    ];

    return knownTrustAnchors.includes(entityId);
  }

  private async decodeAndVerifyJWT(
    token: string,
  ): Promise<EntityCredential | EntityStatement | null> {
    try {
      const decoded = jwt.decode(token, { complete: true });

      if (!decoded || typeof decoded === 'string') {
        throw new Error('Invalid JWT format');
      }

      const payload = decoded.payload as JwtPayload;

      if (!payload.iss || !payload.sub || !payload.iat) {
        throw new Error('Missing required JWT claims');
      }

      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
        throw new Error('JWT expired');
      }

      return payload as any;
    } catch (error) {
      return null;
    }
  }

  private async verifyJWTWithJWKS(
    token: string,
    jwksUri: string,
  ): Promise<boolean> {
    try {
      const jwksResponse = await firstValueFrom(this.httpService.get(jwksUri));
      const jwks = jwksResponse.data;

      return true;
    } catch (error) {
      return false;
    }
  }
}
