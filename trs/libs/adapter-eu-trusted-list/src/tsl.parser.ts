import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type {
  DigitalId,
  LangString,
  OtherTslPointer,
  ServiceStatusInstance,
  TrustedList,
  TrustService,
  TrustServiceProvider,
} from './tsl.model';

export class TrustedListParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TrustedListParseError';
  }
}

/** Elements that may repeat; always materialized as arrays. */
const ARRAY_TAGS = new Set([
  'Name',
  'URI',
  'OtherTSLPointer',
  'ServiceDigitalIdentity',
  'DigitalId',
  'OtherInformation',
  'TrustServiceProvider',
  'TSPService',
  'ServiceHistoryInstance',
  'Extension',
]);

const parser = new XMLParser({
  // TS 119 612 lists are published with arbitrary prefixes (tsl:, ns3:, default ns…).
  removeNSPrefix: true,
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: false,
  htmlEntities: false,
  isArray: (tagName) => ARRAY_TAGS.has(tagName),
});

type Node = Record<string, any>;

const arr = <T = Node>(v: unknown): T[] =>
  v === undefined || v === null ? [] : Array.isArray(v) ? v : [v as T];

const text = (v: unknown): string | undefined => {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'string') return v.trim() || undefined;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object' && '#text' in (v as Node)) {
    return text((v as Node)['#text']);
  }
  return undefined;
};

const date = (v: unknown): Date | undefined => {
  const s = text(v);
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

const int = (v: unknown): number | undefined => {
  const s = text(v);
  return s && /^\d+$/.test(s) ? Number(s) : undefined;
};

const b64 = (v: unknown): Buffer | undefined => {
  const s = text(v)?.replace(/\s+/g, '');
  return s ? Buffer.from(s, 'base64') : undefined;
};

const langStrings = (container: unknown): LangString[] =>
  arr((container as Node | undefined)?.Name)
    .map((n) => ({
      lang:
        typeof n === 'object' ? (n['@_lang'] ?? n['@_xml:lang']) : undefined,
      value: text(n) ?? '',
    }))
    .filter((n) => n.value);

const digitalIds = (serviceDigitalIdentity: unknown): DigitalId[] =>
  arr<Node>(serviceDigitalIdentity)
    .flatMap((sdi) => arr<Node>(sdi.DigitalId))
    .map((d) => ({
      certificate: b64(d.X509Certificate),
      ski: b64(d.X509SKI),
      subjectName: text(d.X509SubjectName),
    }))
    .filter((d) => d.certificate || d.ski || d.subjectName);

const statusInstance = (n: Node): ServiceStatusInstance | undefined => {
  const additionalServiceInformation = arr<Node>(
    n.ServiceInformationExtensions?.Extension,
  )
    .flatMap((ext) => arr(ext.AdditionalServiceInformation?.URI))
    .map(text)
    .filter((u): u is string => !!u);
  const statusStartingTime = date(n.StatusStartingTime);
  const serviceType = text(n.ServiceTypeIdentifier);
  const status = text(n.ServiceStatus);
  if (!statusStartingTime || !serviceType || !status) return undefined;
  return {
    serviceType,
    serviceNames: langStrings(n.ServiceName),
    status,
    statusStartingTime,
    digitalIds: digitalIds(n.ServiceDigitalIdentity),
    additionalServiceInformation,
  };
};

const pointer = (p: Node): OtherTslPointer | undefined => {
  const location = text(p.TSLLocation);
  if (!location) return undefined;
  const info: Node = {};
  for (const oi of arr<Node>(p.AdditionalInformation?.OtherInformation)) {
    Object.assign(info, oi);
  }
  return {
    location,
    tslType: text(info.TSLType),
    schemeTerritory: text(info.SchemeTerritory),
    mimeType: text(info.MimeType),
    schemeOperatorNames: langStrings(info.SchemeOperatorName),
    signingCertificates: digitalIds(
      p.ServiceDigitalIdentities?.ServiceDigitalIdentity,
    )
      .map((d) => d.certificate)
      .filter((c): c is Buffer => !!c),
  };
};

/**
 * Parses an ETSI TS 119 612 trusted list (TLv5 / TLv6 and later, XML binding).
 * Namespace prefixes are ignored. This does NOT verify the list's signature —
 * see `TrustedListSignatureVerifier`.
 */
export function parseTrustedList(xml: string): TrustedList {
  // Trusted lists never need a DTD; refuse one outright (XXE / entity expansion).
  if (/<!DOCTYPE/i.test(xml)) {
    throw new TrustedListParseError('DOCTYPE is not allowed in a trusted list');
  }
  const valid = XMLValidator.validate(xml);
  if (valid !== true) {
    throw new TrustedListParseError(
      `Malformed XML: ${valid.err.msg} (line ${valid.err.line})`,
    );
  }
  let doc: Node;
  try {
    doc = parser.parse(xml);
  } catch (e) {
    throw new TrustedListParseError(`Malformed XML: ${(e as Error).message}`);
  }
  const root: Node | undefined = doc.TrustServiceStatusList;
  if (!root || typeof root !== 'object') {
    throw new TrustedListParseError(
      'Root element TrustServiceStatusList not found',
    );
  }
  const si: Node = root.SchemeInformation ?? {};

  const warnings: string[] = [];
  const providers: TrustServiceProvider[] = arr<Node>(
    root.TrustServiceProviderList?.TrustServiceProvider,
  ).map((tsp, i) => {
    const services: TrustService[] = [];
    arr<Node>(tsp.TSPServices?.TSPService).forEach((svc, j) => {
      const current = statusInstance(svc.ServiceInformation ?? {});
      if (!current) {
        // An unusable entry can only ever make a query fail closed, so skip it.
        warnings.push(
          `TSP[${i}]/TSPService[${j}]: incomplete ServiceInformation, skipped`,
        );
        return;
      }
      const history = arr<Node>(svc.ServiceHistory?.ServiceHistoryInstance)
        .map(statusInstance)
        .filter((h): h is ServiceStatusInstance => !!h);
      services.push({ current, history });
    });
    return {
      names: langStrings(tsp.TSPInformation?.TSPName),
      tradeNames: langStrings(tsp.TSPInformation?.TSPTradeName),
      services,
    };
  });

  return {
    versionIdentifier: int(si.TSLVersionIdentifier),
    sequenceNumber: int(si.TSLSequenceNumber),
    tslType: text(si.TSLType),
    schemeTerritory: text(si.SchemeTerritory),
    schemeOperatorNames: langStrings(si.SchemeOperatorName),
    listIssueDateTime: date(si.ListIssueDateTime),
    nextUpdate: date(si.NextUpdate?.dateTime),
    pointers: arr<Node>(si.PointersToOtherTSL?.OtherTSLPointer)
      .map(pointer)
      .filter((p): p is OtherTslPointer => !!p),
    providers,
    hasSignature: root.Signature !== undefined,
    warnings,
  };
}
