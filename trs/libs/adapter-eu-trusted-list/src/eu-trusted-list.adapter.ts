import { Inject, Logger } from '@nestjs/common';
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
import { parseEntityId } from './entity-id';
import {
  EU_TRUSTED_LIST_OPTIONS,
  EuTrustedListAdapterOptions,
  EuTrustedListSource,
} from './eu-trusted-list.options';
import { NoopSignatureVerifier } from './signature-verifier';
import {
  EU_LOTL_URL,
  SERVICE_TYPE_PREFIX,
  SVC_INFO_EXT_PREFIX,
} from './tsl.constants';
import { evaluate, ServiceMatch } from './tsl.evaluator';
import type { OtherTslPointer } from './tsl.model';
import { HttpTrustedListFetcher } from './trusted-list.fetcher';
import {
  isXmlTlPointer,
  LoadedList,
  normalizeListUrl,
  TrustedListStore,
} from './trusted-list.store';
import { pemOrBase64ToDer } from './x509.util';

/** One or more trusted lists could not be loaded, so no negative answer is possible → 503. */
export class TrustedListUnavailableError extends AdapterError {
  constructor(detail: string) {
    super(`Trusted list unavailable: ${detail}`, 503);
  }
}

interface Root {
  source: EuTrustedListSource;
  signers: Buffer[];
}

/** Expands `*`/`any`, short names and full URIs to a full URI (undefined = any). */
const expandUri = (value: string, prefix: string): string | undefined => {
  const v = value.trim();
  if (v === '*' || v.toLowerCase() === 'any') return undefined;
  return v.includes('://') ? v : prefix + v.replace(/^\/+/, '');
};

const short = (uri: string) => uri.replace(/\/+$/, '').split('/').pop() ?? uri;

/** `VATDE-…` / `NTRFI-…` trade-name identifiers carry the territory. */
const territoryHint = (entityId: string): string | undefined =>
  /^tsp:(?:VAT|NTR)([A-Z]{2})-/i.exec(entityId.trim())?.[1]?.toUpperCase();

/**
 * EU Trusted List adapter (ETSI TS 119 612, eIDAS).
 *
 * - `authority_id` — URL of a configured trusted list, typically the EU LoTL,
 *   or of a national trusted list the loaded LoTL points to.
 * - `entity_id`    — see `parseEntityId` (certificate, SKI, fingerprint, TSP name).
 * - `resource`     — ServiceTypeIdentifier (`CA/QC`, `TSA/QTST`, full URI, `*`).
 * - `action`       — AdditionalServiceInformation (`ForeSignatures`, …, `any`).
 * - `context.time` — evaluation time, resolved against `ServiceHistory`.
 *
 * Recognition: a LoTL recognizes a national trusted list iff it points to it.
 */
@TrustAdapter('eu-trusted-list', { order: 90 })
export class EuTrustedListAdapter implements TrustProtocolAdapter {
  readonly id = 'eu-trusted-list';
  private readonly log = new Logger(EuTrustedListAdapter.name);
  private readonly store: TrustedListStore;
  private readonly roots = new Map<string, Root>();
  private readonly verifierId: string;

  constructor(
    @Inject(EU_TRUSTED_LIST_OPTIONS)
    private readonly opts: EuTrustedListAdapterOptions,
  ) {
    const verifier = opts.signatureVerifier ?? new NoopSignatureVerifier();
    if (
      opts.requireSignatureVerification &&
      verifier instanceof NoopSignatureVerifier
    ) {
      throw new Error(
        'EuTrustedListAdapter: requireSignatureVerification needs a signatureVerifier',
      );
    }
    this.verifierId = verifier.id;
    for (const source of opts.sources ?? [
      { url: EU_LOTL_URL, kind: 'lotl' as const },
    ]) {
      const url = normalizeListUrl(source.url);
      if (!url)
        throw new Error(
          `EuTrustedListAdapter: invalid source URL ${source.url}`,
        );
      this.roots.set(url, {
        source,
        signers: (source.signingCertificates ?? []).map(pemOrBase64ToDer),
      });
    }
    this.store = new TrustedListStore({
      fetcher: opts.fetcher ?? new HttpTrustedListFetcher(opts.http),
      verifier,
      requireSignatureVerification: !!opts.requireSignatureVerification,
      maxCacheAgeMs: opts.maxCacheAgeMs ?? 6 * 60 * 60 * 1000,
      retryAfterFailureMs: opts.retryAfterFailureMs ?? 60_000,
      now: opts.now ?? (() => new Date()),
    });
  }

  // ---------------------------------------------------------------- routing

  async canHandle(authorityId: string): Promise<boolean> {
    const url = normalizeListUrl(authorityId);
    if (!url) return false; // not http(s): no I/O
    if (this.roots.has(url)) return true;
    if (this.findPointer(url)) return true;
    // Unknown http(s) authority: make sure every LoTL is loaded once, then look
    // again. Load failures propagate → registry reports 503 if nobody else matches.
    await Promise.all(
      this.lotlRoots().map(([u, r]) => this.store.load(u, 'lotl', r.signers)),
    );
    return !!this.findPointer(url);
  }

  // ---------------------------------------------------------- authorization

  async resolveAuthorization(
    input: AuthorizationInput,
  ): Promise<AuthorizationOutcome> {
    const url = this.requireUrl(input.authorityId);
    const entity = parseEntityId(input.entityId);
    const serviceType = expandUri(input.resource, SERVICE_TYPE_PREFIX);
    const usage = expandUri(input.action, SVC_INFO_EXT_PREFIX);
    const at = input.context?.time ? new Date(input.context.time) : this.now();

    const { lists, failures } = await this.listsFor(
      url,
      territoryHint(input.entityId),
    );

    const rejections: string[] = [];
    for (const loaded of lists) {
      const result = evaluate(loaded.index, { entity, serviceType, usage, at });
      if (result.granted) {
        return {
          authorized: true,
          message: this.grantMessage(loaded, result.granted, lists),
          freshUntil: this.freshUntil(lists),
          evidence: this.evidence(lists, failures, result.granted),
        };
      }
      rejections.push(...result.rejections);
    }

    if (failures.length && this.opts.onListUnavailable !== 'ignore') {
      throw new TrustedListUnavailableError(failures.join('; '));
    }
    const why = rejections.length
      ? rejections.slice(0, 3).join('; ') + (rejections.length > 3 ? '; …' : '')
      : 'no matching trust service';
    return {
      authorized: false,
      message: `Not authorized by trusted list: ${why}${this.sigSuffix(lists)}`,
      freshUntil: this.freshUntil(lists),
      evidence: this.evidence(lists, failures),
    };
  }

  // ------------------------------------------------------------ recognition

  async resolveRecognition(
    input: RecognitionInput,
  ): Promise<RecognitionOutcome> {
    const url = this.requireUrl(input.authorityId);
    const root = this.roots.get(url);
    if (root?.source.kind !== 'lotl') {
      throw new UnsupportedOperationError(
        'recognition (authority is not a list of trusted lists)',
        this.id,
      );
    }
    const lotl = await this.store.load(url, 'lotl', root.signers);
    const target = normalizeListUrl(input.entityId);
    const pointer = target
      ? lotl.index.list.pointers.find(
          (p) => isXmlTlPointer(p) && normalizeListUrl(p.location) === target,
        )
      : undefined;
    return {
      recognized: !!pointer,
      message: pointer
        ? `Recognized: ${pointer.schemeTerritory ?? '?'} trusted list is listed in ${short(url)}${this.sigSuffix([lotl])}`
        : `Not recognized: ${input.entityId} is not listed in ${short(url)}${this.sigSuffix([lotl])}`,
      freshUntil: lotl.expiresAt,
      evidence: this.evidence([lotl], [], undefined, pointer),
    };
  }

  // ---------------------------------------------------------------- helpers

  private now(): Date {
    return this.opts.now ? this.opts.now() : new Date();
  }

  private requireUrl(authorityId: string): string {
    const url = normalizeListUrl(authorityId);
    if (!url)
      throw new UnsupportedOperationError(`authority ${authorityId}`, this.id);
    return url;
  }

  private lotlRoots(): [string, Root][] {
    return [...this.roots].filter(([, r]) => r.source.kind === 'lotl');
  }

  /** Finds `url` among national-list pointers of loaded LoTLs (no I/O). */
  private findPointer(
    url: string,
  ): { lotlUrl: string; pointer: OtherTslPointer } | undefined {
    for (const [lotlUrl] of this.lotlRoots()) {
      const lotl = this.store.last(lotlUrl);
      const pointer = lotl?.index.list.pointers.find(
        (p) => isXmlTlPointer(p) && normalizeListUrl(p.location) === url,
      );
      if (pointer) return { lotlUrl, pointer };
    }
    return undefined;
  }

  /** Resolves the authority to the concrete trusted lists to search. */
  private async listsFor(
    url: string,
    territory?: string,
  ): Promise<{ lists: LoadedList[]; failures: string[] }> {
    const root = this.roots.get(url);
    const failures: string[] = [];

    if (root?.source.kind === 'tl') {
      return {
        lists: [await this.loadOrThrow(url, 'tl', root.signers)],
        failures,
      };
    }

    if (root?.source.kind === 'lotl') {
      const lotl = await this.loadOrThrow(url, 'lotl', root.signers);
      let pointers = lotl.index.list.pointers.filter(isXmlTlPointer);
      if (territory) {
        const hinted = pointers.filter(
          (p) => p.schemeTerritory?.toUpperCase() === territory,
        );
        if (hinted.length) pointers = hinted;
      }
      const lists = await this.loadMany(pointers, failures);
      return { lists, failures };
    }

    // A national list reached through a LoTL pointer (make sure the LoTL is current).
    for (const [lotlUrl, r] of this.lotlRoots()) {
      await this.loadOrThrow(lotlUrl, 'lotl', r.signers);
    }
    const found = this.findPointer(url);
    if (!found)
      throw new UnsupportedOperationError(`authority ${url}`, this.id);
    const lists = await this.loadMany([found.pointer], failures);
    if (!lists.length)
      throw new TrustedListUnavailableError(failures.join('; '));
    return { lists, failures };
  }

  private async loadOrThrow(
    url: string,
    kind: 'lotl' | 'tl',
    signers: Buffer[],
  ) {
    try {
      return await this.store.load(url, kind, signers);
    } catch (e) {
      throw new TrustedListUnavailableError((e as Error).message);
    }
  }

  private async loadMany(
    pointers: OtherTslPointer[],
    failures: string[],
  ): Promise<LoadedList[]> {
    const lists: LoadedList[] = [];
    const queue = [...pointers];
    const worker = async () => {
      for (let p = queue.shift(); p; p = queue.shift()) {
        const url = normalizeListUrl(p.location);
        if (!url) {
          failures.push(
            `${p.schemeTerritory ?? '?'}: invalid location ${p.location}`,
          );
          continue;
        }
        try {
          lists.push(await this.store.load(url, 'tl', p.signingCertificates));
        } catch (e) {
          failures.push(`${p.schemeTerritory ?? '?'}: ${(e as Error).message}`);
        }
      }
    };
    const n = Math.max(
      1,
      Math.min(this.opts.loadConcurrency ?? 6, pointers.length),
    );
    await Promise.all(Array.from({ length: n }, worker));
    if (failures.length)
      this.log.warn(`unavailable trusted lists: ${failures.join('; ')}`);
    // Stable, territory-ordered evaluation regardless of download order.
    return lists.sort((a, b) =>
      (a.index.list.schemeTerritory ?? '').localeCompare(
        b.index.list.schemeTerritory ?? '',
      ),
    );
  }

  private grantMessage(
    loaded: LoadedList,
    m: ServiceMatch,
    consulted: LoadedList[],
  ): string {
    const tsp = m.provider.names[0]?.value ?? 'unnamed TSP';
    const svc = m.instance.serviceNames[0]?.value ?? 'unnamed service';
    return (
      `Authorized by ${loaded.index.list.schemeTerritory ?? '?'} trusted list: ${tsp} / ${svc} ` +
      `(${short(m.instance.serviceType)}, ${short(m.instance.status)}, matched by ${m.matchedBy})` +
      this.sigSuffix(consulted)
    );
  }

  private sigSuffix(lists: LoadedList[]): string {
    const notes: string[] = [];
    if (lists.some((l) => !l.signature.verified))
      notes.push('list signature not verified');
    if (lists.some((l) => l.expired)) notes.push('list past NextUpdate');
    return notes.length ? ` [${notes.join(', ')}]` : '';
  }

  private freshUntil(lists: LoadedList[]): Date | undefined {
    const times = lists.map((l) => l.expiresAt.getTime());
    return times.length ? new Date(Math.min(...times)) : undefined;
  }

  private evidence(
    lists: LoadedList[],
    failures: string[],
    match?: ServiceMatch,
    pointer?: OtherTslPointer,
  ) {
    return {
      signatureVerifier: this.verifierId,
      lists: lists.map((l) => ({
        url: l.url,
        territory: l.index.list.schemeTerritory,
        tslType: l.index.list.tslType && short(l.index.list.tslType),
        version: l.index.list.versionIdentifier,
        sequenceNumber: l.index.list.sequenceNumber,
        nextUpdate: l.index.list.nextUpdate?.toISOString(),
        expired: l.expired,
        signatureVerified: l.signature.verified,
      })),
      failures,
      match: match && {
        tsp: match.provider.names[0]?.value,
        service: match.instance.serviceNames[0]?.value,
        serviceType: match.instance.serviceType,
        status: match.instance.status,
        statusStartingTime: match.instance.statusStartingTime.toISOString(),
        matchedBy: match.matchedBy,
      },
      pointer: pointer && {
        location: pointer.location,
        territory: pointer.schemeTerritory,
      },
    };
  }
}
