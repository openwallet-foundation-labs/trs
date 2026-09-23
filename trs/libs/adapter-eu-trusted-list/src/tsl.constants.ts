/** URIs defined by ETSI TS 119 612 (Trusted Lists). */

/** The EU List of Trusted Lists (LoTL) published by the European Commission. */
export const EU_LOTL_URL = 'https://ec.europa.eu/tools/lotl/eu-lotl.xml';

export const SERVICE_TYPE_PREFIX = 'http://uri.etsi.org/TrstSvc/Svctype/';
export const SERVICE_STATUS_PREFIX =
  'http://uri.etsi.org/TrstSvc/TrustedList/Svcstatus/';
export const SVC_INFO_EXT_PREFIX =
  'http://uri.etsi.org/TrstSvc/TrustedList/SvcInfoExt/';
export const TSL_TYPE_PREFIX =
  'http://uri.etsi.org/TrstSvc/TrustedList/TSLType/';

/** TSLType of a list of trusted lists (e.g. `EUlistofthelists`). */
export const isListOfListsType = (tslType: string | undefined): boolean =>
  !!tslType && /listofthelists$/i.test(tslType);

/** MIME type of an XML trusted list in `OtherTSLPointer/AdditionalInformation`. */
export const TSL_XML_MIME_TYPE = 'application/vnd.etsi.tsl+xml';

/**
 * Service statuses that mean "the service is (positively) listed" at a point
 * in time. `granted` / `recognisedatnationallevel` are the TS 119 612 v2
 * values; the rest are the pre-2016 (v1 / TS 102 231) values that can still
 * appear in `ServiceHistory`.
 */
export const POSITIVE_SERVICE_STATUSES: ReadonlySet<string> = new Set(
  [
    'granted',
    'recognisedatnationallevel',
    // legacy (eSignature Directive era)
    'undersupervision',
    'supervisionincessation',
    'accredited',
    'setbynationallaw',
  ].map((s) => SERVICE_STATUS_PREFIX + s),
);
