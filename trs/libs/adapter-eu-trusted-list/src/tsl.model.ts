/**
 * Normalized, namespace-independent view of an ETSI TS 119 612 trusted list.
 * Only the parts TRS needs for trust resolution are kept.
 */

export interface LangString {
  lang?: string;
  value: string;
}

/** One `DigitalId` inside a `ServiceDigitalIdentity`. */
export interface DigitalId {
  /** DER bytes of `X509Certificate`. */
  certificate?: Buffer;
  /** `X509SKI`, decoded. */
  ski?: Buffer;
  /** `X509SubjectName`, verbatim. */
  subjectName?: string;
}

/** A service status that applies from `statusStartingTime` onward. */
export interface ServiceStatusInstance {
  serviceType: string;
  serviceNames: LangString[];
  status: string;
  statusStartingTime: Date;
  digitalIds: DigitalId[];
  /** `AdditionalServiceInformation/URI` values, e.g. `…/SvcInfoExt/ForeSignatures`. */
  additionalServiceInformation: string[];
}

export interface TrustService {
  /** Current `ServiceInformation`. */
  current: ServiceStatusInstance;
  /** `ServiceHistory/ServiceHistoryInstance`, as listed. */
  history: ServiceStatusInstance[];
}

export interface TrustServiceProvider {
  names: LangString[];
  /** `TSPTradeName` values — includes registration ids like `VATDE-…`, `NTRFI-…`. */
  tradeNames: LangString[];
  services: TrustService[];
}

/** An `OtherTSLPointer` (only meaningful in a list of lists). */
export interface OtherTslPointer {
  location: string;
  tslType?: string;
  schemeTerritory?: string;
  mimeType?: string;
  schemeOperatorNames: LangString[];
  /** Certificates allowed to sign the pointed-to list. */
  signingCertificates: Buffer[];
}

export interface TrustedList {
  versionIdentifier?: number;
  sequenceNumber?: number;
  tslType?: string;
  schemeTerritory?: string;
  schemeOperatorNames: LangString[];
  listIssueDateTime?: Date;
  /** Absent `NextUpdate/dateTime` means the scheme is closed. */
  nextUpdate?: Date;
  pointers: OtherTslPointer[];
  providers: TrustServiceProvider[];
  /** Whether the document carries an enveloped `ds:Signature`. */
  hasSignature: boolean;
  /** Non-fatal problems found while parsing (skipped entries etc.). */
  warnings: string[];
}
