import { Inject } from '@nestjs/common';
import {
  AdapterError,
  TrustAdapter,
  UnsupportedOperationError,
} from '@app/adapter-kit';
import type {
  AuthorizationInput,
  AuthorizationOutcome,
  RecognitionInput,
  RecognitionOutcome,
  TrustProtocolAdapter,
} from '@app/adapter-kit';
import {
  Certificate,
  EXT_KEY_USAGES,
  KEY_USAGES,
  KeyUsage,
  OID,
  parseCertificate,
  pemOrBase64ToDer,
  splitPem,
} from './certificate';
import { Crl, isCrlIssuedBy, parseCrl, pemOrBase64CrlToDer } from './crl';
import { CrlStore, HttpCrlFetcher } from './crl.store';
import { parseEntityId } from './entity-id';
import { subjectCn, validatePath } from './path.validator';
import { PKI_X509_OPTIONS, PkiX509AdapterOptions } from './pki-x509.options';

export class RevocationUnavailableError extends AdapterError {
  constructor(detail: string) {
    super(`Revocation status unavailable: ${detail}`, 503);
  }
}

export class InvalidUsageError extends AdapterError {
  constructor(detail: string) {
    super(`Invalid PKI usage: ${detail}`, 400);
  }
}

interface Authority {
  id: string;
  anchors: Certificate[];
  intermediates: Certificate[];
  crls: Crl[];
}

interface UsedCrl {
  source: string;
  crl: Crl;
  expiresAt?: Date;
}

type RevocationResult =
  | { ok: true; crls: UsedCrl[]; notes: string[] }
  | { ok: false; reason: string; crls: UsedCrl[] };

const isAny = (v: string) => v === '*' || v.toLowerCase() === 'any';

@TrustAdapter('pki-x509', { order: 50 })
export class PkiX509Adapter implements TrustProtocolAdapter {
  readonly id = 'pki-x509';
  private readonly authorities = new Map<string, Authority>();
  private readonly store: CrlStore;

  constructor(
    @Inject(PKI_X509_OPTIONS)
    private readonly opts: PkiX509AdapterOptions,
  ) {
    for (const a of opts.authorities ?? []) {
      const id = a.id.trim();
      if (this.authorities.has(id)) {
        throw new Error(`PkiX509Adapter: duplicate authority ${id}`);
      }
      const anchors = certificates(a.trustAnchors, `${id} trust anchor`);
      if (!anchors.length) {
        throw new Error(`PkiX509Adapter: authority ${id} has no trust anchors`);
      }
      this.authorities.set(id, {
        id,
        anchors,
        intermediates: certificates(
          a.intermediates ?? [],
          `${id} intermediate`,
        ),
        crls: (a.crls ?? []).map((c, i) => {
          try {
            return parseCrl(pemOrBase64CrlToDer(c));
          } catch (e) {
            throw new Error(
              `PkiX509Adapter: ${id} CRL #${i + 1}: ${(e as Error).message}`,
            );
          }
        }),
      });
    }
    this.store = new CrlStore({
      fetcher: opts.crlFetcher ?? new HttpCrlFetcher(opts.http),
      maxCacheAgeMs: opts.maxCrlCacheAgeMs ?? 24 * 60 * 60 * 1000,
      retryAfterFailureMs: opts.retryAfterFailureMs ?? 60_000,
      now: () => this.now(),
    });
  }

  async canHandle(authorityId: string): Promise<boolean> {
    return this.authorities.has(authorityId.trim());
  }

  async resolveAuthorization(
    input: AuthorizationInput,
  ): Promise<AuthorizationOutcome> {
    const authority = this.requireAuthority(input.authorityId);
    const extKeyUsage = this.extKeyUsage(input.resource);
    const keyUsage = this.keyUsage(input.action);
    const [leaf, ...offered] = parseEntityId(input.entityId);

    const verdict = await this.verify(authority, leaf, offered, this.at(input));
    if (!verdict.ok) return { authorized: false, ...verdict.outcome };

    const usage = this.checkUsage(leaf, keyUsage, extKeyUsage);
    if (usage) {
      return {
        authorized: false,
        message: `Not authorized by ${authority.id}: ${usage}`,
        freshUntil: verdict.outcome.freshUntil,
        evidence: verdict.outcome.evidence,
      };
    }
    return { authorized: true, ...verdict.outcome };
  }

  async resolveRecognition(
    input: RecognitionInput,
  ): Promise<RecognitionOutcome> {
    const authority = this.requireAuthority(input.authorityId);
    const [ca, ...offered] = parseEntityId(input.entityId);
    if (!ca.basicConstraints?.ca) {
      return {
        recognized: false,
        message: `Not recognized by ${authority.id}: ${subjectCn(ca)} is not a CA certificate`,
      };
    }
    const verdict = await this.verify(authority, ca, offered, this.at(input));
    return { recognized: verdict.ok, ...verdict.outcome };
  }

  private now(): Date {
    return this.opts.now ? this.opts.now() : new Date();
  }

  private at(input: AuthorizationInput): Date {
    return input.context?.time ? new Date(input.context.time) : this.now();
  }

  private requireAuthority(authorityId: string): Authority {
    const authority = this.authorities.get(authorityId.trim());
    if (!authority) {
      throw new UnsupportedOperationError(`authority ${authorityId}`, this.id);
    }
    return authority;
  }

  private async verify(
    authority: Authority,
    leaf: Certificate,
    offered: Certificate[],
    at: Date,
  ): Promise<{
    ok: boolean;
    outcome: { message: string; freshUntil?: Date; evidence: unknown };
  }> {
    const path = validatePath({
      leaf,
      anchors: authority.anchors,
      intermediates: [...authority.intermediates, ...offered],
      at,
      maxIntermediates: this.opts.maxIntermediates ?? 8,
    });
    if (!path.valid) {
      return {
        ok: false,
        outcome: {
          message: `Not trusted by ${authority.id}: ${summarize(path.reasons)}`,
          evidence: { authority: authority.id, reasons: path.reasons },
        },
      };
    }

    const { chain } = path;
    const revocation = await this.checkRevocation(authority, chain, at);
    const freshUntil = earliest([
      ...chain.map((c) => c.notAfter),
      ...revocation.crls.map((c) => c.expiresAt ?? c.crl.nextUpdate),
    ]);
    const evidence = {
      authority: authority.id,
      chain: chain.map((c) => ({
        subject: c.x509.subject,
        serial: c.serial,
        sha256: c.sha256,
        notAfter: c.notAfter.toISOString(),
      })),
      crls: revocation.crls.map((c) => ({
        source: c.source,
        thisUpdate: c.crl.thisUpdate.toISOString(),
        nextUpdate: c.crl.nextUpdate?.toISOString(),
      })),
    };
    if (!revocation.ok) {
      return {
        ok: false,
        outcome: {
          message: `Not trusted by ${authority.id}: ${revocation.reason}`,
          freshUntil,
          evidence,
        },
      };
    }
    const anchor = chain[chain.length - 1];
    const notes = revocation.notes.length
      ? ` [${revocation.notes.join(', ')}]`
      : '';
    return {
      ok: true,
      outcome: {
        message: `Trusted by ${authority.id}: ${subjectCn(leaf)} chains to ${subjectCn(anchor)}${notes}`,
        freshUntil,
        evidence,
      },
    };
  }

  private async checkRevocation(
    authority: Authority,
    chain: Certificate[],
    at: Date,
  ): Promise<RevocationResult> {
    const used: UsedCrl[] = [];
    const notes: string[] = [];
    for (let i = 0; i < chain.length - 1; i++) {
      const cert = chain[i];
      const issuer = chain[i + 1];
      const crl = await this.crlFor(authority, cert, issuer, notes);
      if (!crl) {
        if (this.opts.requireRevocationInfo) {
          return {
            ok: false,
            reason: `no revocation information for ${subjectCn(cert)}`,
            crls: used,
          };
        }
        continue;
      }
      used.push(crl);
      const revokedAt = crl.crl.revoked.get(cert.serial);
      if (revokedAt && revokedAt <= at) {
        return {
          ok: false,
          reason: `${subjectCn(cert)} was revoked on ${revokedAt.toISOString()}`,
          crls: used,
        };
      }
    }
    return { ok: true, crls: used, notes };
  }

  private async crlFor(
    authority: Authority,
    cert: Certificate,
    issuer: Certificate,
    notes: string[],
  ): Promise<UsedCrl | undefined> {
    const now = this.now();
    const configured = authority.crls.find(
      (c) => isCrlIssuedBy(c, issuer) && (!c.nextUpdate || c.nextUpdate >= now),
    );
    if (configured) return { source: 'configured', crl: configured };

    const urls = this.opts.fetchCrls === false ? [] : cert.crlUrls;
    const fetchable = urls.filter((u) => /^https?:\/\//i.test(u));
    if (!fetchable.length) return undefined;

    const failures: string[] = [];
    for (const url of fetchable) {
      try {
        const loaded = await this.store.load(url);
        if (isCrlIssuedBy(loaded.crl, issuer)) {
          return { source: url, crl: loaded.crl, expiresAt: loaded.expiresAt };
        }
        failures.push(`${url}: not issued by ${subjectCn(issuer)}`);
      } catch (e) {
        failures.push((e as Error).message);
      }
    }
    if (this.opts.onRevocationUnavailable === 'ignore') {
      notes.push(`revocation not checked for ${subjectCn(cert)}`);
      return undefined;
    }
    throw new RevocationUnavailableError(failures.join('; '));
  }

  private keyUsage(action: string): KeyUsage | undefined {
    const v = action.trim();
    if (isAny(v)) return undefined;
    const match = KEY_USAGES.find((k) => k.toLowerCase() === v.toLowerCase());
    if (!match) {
      throw new InvalidUsageError(
        `unknown key usage '${action}' (expected one of ${KEY_USAGES.join(', ')} or any)`,
      );
    }
    return match;
  }

  private extKeyUsage(resource: string): string | undefined {
    const v = resource.trim();
    if (isAny(v)) return undefined;
    if (/^\d+(\.\d+)+$/.test(v)) return v;
    const oid = Object.entries(EXT_KEY_USAGES).find(
      ([name]) => name.toLowerCase() === v.toLowerCase(),
    )?.[1];
    if (!oid) {
      throw new InvalidUsageError(
        `unknown extended key usage '${resource}' (expected ${Object.keys(EXT_KEY_USAGES).join(', ')}, an OID or *)`,
      );
    }
    return oid;
  }

  private checkUsage(
    leaf: Certificate,
    keyUsage?: KeyUsage,
    extKeyUsage?: string,
  ): string | undefined {
    if (keyUsage && leaf.keyUsage && !leaf.keyUsage.has(keyUsage)) {
      return `${subjectCn(leaf)} does not allow ${keyUsage}`;
    }
    if (
      extKeyUsage &&
      leaf.extKeyUsage &&
      !leaf.extKeyUsage.includes(extKeyUsage) &&
      !leaf.extKeyUsage.includes(OID.anyExtendedKeyUsage)
    ) {
      return `${subjectCn(leaf)} does not allow extended key usage ${extKeyUsage}`;
    }
    return undefined;
  }
}

function certificates(values: string[], what: string): Certificate[] {
  return values.flatMap(splitPem).map((v, i) => {
    try {
      return parseCertificate(pemOrBase64ToDer(v));
    } catch (e) {
      throw new Error(
        `PkiX509Adapter: ${what} #${i + 1}: ${(e as Error).message}`,
      );
    }
  });
}

function earliest(dates: (Date | undefined)[]): Date | undefined {
  const times = dates.filter((d): d is Date => !!d).map((d) => d.getTime());
  return times.length ? new Date(Math.min(...times)) : undefined;
}

const summarize = (reasons: string[]) =>
  reasons.slice(0, 3).join('; ') + (reasons.length > 3 ? '; …' : '');
