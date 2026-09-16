import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractSki } from '../../src/x509.util';

/** Test fixtures: synthetic TS 119 612 lists built around throwaway certificates. */

export const pem = (name: string) =>
  readFileSync(join(__dirname, `${name}.pem`), 'utf8');

export const b64 = (name: string) =>
  pem(name)
    .replace(/-----(BEGIN|END) CERTIFICATE-----/g, '')
    .replace(/\s+/g, '');

export const skiB64 = (name: string) =>
  extractSki(Buffer.from(b64(name), 'base64'))!.toString('base64');

export const LOTL_URL = 'https://lotl.example/eu-lotl.xml';
export const ZZ_TL_URL = 'https://tl.zz.example/tl.xml';
export const XY_TL_URL = 'https://tl.xy.example/tl.xml';

const ST = 'http://uri.etsi.org/TrstSvc/TrustedList/Svcstatus/';
const SVC = 'http://uri.etsi.org/TrstSvc/Svctype/';
const EXT = 'http://uri.etsi.org/TrstSvc/TrustedList/SvcInfoExt/';

const usage = (u?: string) =>
  u
    ? `<tsl:ServiceInformationExtensions><tsl:Extension Critical="true">
         <tsl:AdditionalServiceInformation><tsl:URI xml:lang="en">${EXT}${u}</tsl:URI></tsl:AdditionalServiceInformation>
       </tsl:Extension></tsl:ServiceInformationExtensions>`
    : '';

/**
 * National trusted list "ZZ" (written with a `tsl:` prefix on purpose):
 *  - Example QC CA G1: CA/QC, ForeSignatures, granted since 2016-07-01
 *  - Example QC CA G0: CA/QC, ForeSignatures, withdrawn since 2022-01-01
 *      history → granted 2016-07-01, undersupervision 2012-01-01 (SKI only)
 *  - Example QTST:     TSA/QTST, granted since 2017-01-01
 */
export const zzTrustedList = (
  nextUpdate = '2099-01-01T00:00:00Z',
) => `<?xml version="1.0" encoding="UTF-8"?>
<tsl:TrustServiceStatusList xmlns:tsl="http://uri.etsi.org/02231/v2#" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" TSLTag="http://uri.etsi.org/19612/TSLTag">
  <tsl:SchemeInformation>
    <tsl:TSLVersionIdentifier>6</tsl:TSLVersionIdentifier>
    <tsl:TSLSequenceNumber>42</tsl:TSLSequenceNumber>
    <tsl:TSLType>http://uri.etsi.org/TrstSvc/TrustedList/TSLType/EUgeneric</tsl:TSLType>
    <tsl:SchemeOperatorName><tsl:Name xml:lang="en">ZZ Supervisory Body</tsl:Name></tsl:SchemeOperatorName>
    <tsl:SchemeTerritory>ZZ</tsl:SchemeTerritory>
    <tsl:ListIssueDateTime>2026-01-01T00:00:00Z</tsl:ListIssueDateTime>
    <tsl:NextUpdate><tsl:dateTime>${nextUpdate}</tsl:dateTime></tsl:NextUpdate>
  </tsl:SchemeInformation>
  <tsl:TrustServiceProviderList>
    <tsl:TrustServiceProvider>
      <tsl:TSPInformation>
        <tsl:TSPName><tsl:Name xml:lang="en">Example QTSP S.A.</tsl:Name></tsl:TSPName>
        <tsl:TSPTradeName>
          <tsl:Name xml:lang="en">Example QTSP</tsl:Name>
          <tsl:Name xml:lang="en">VATZZ-12345678</tsl:Name>
        </tsl:TSPTradeName>
      </tsl:TSPInformation>
      <tsl:TSPServices>
        <tsl:TSPService>
          <tsl:ServiceInformation>
            <tsl:ServiceTypeIdentifier>${SVC}CA/QC</tsl:ServiceTypeIdentifier>
            <tsl:ServiceName><tsl:Name xml:lang="en">Example QC CA G1</tsl:Name></tsl:ServiceName>
            <tsl:ServiceDigitalIdentity><tsl:DigitalId>
              <tsl:X509Certificate>${b64('ca-qc-granted')}</tsl:X509Certificate>
            </tsl:DigitalId></tsl:ServiceDigitalIdentity>
            <tsl:ServiceStatus>${ST}granted</tsl:ServiceStatus>
            <tsl:StatusStartingTime>2016-07-01T00:00:00Z</tsl:StatusStartingTime>
            ${usage('ForeSignatures')}
          </tsl:ServiceInformation>
        </tsl:TSPService>
        <tsl:TSPService>
          <tsl:ServiceInformation>
            <tsl:ServiceTypeIdentifier>${SVC}CA/QC</tsl:ServiceTypeIdentifier>
            <tsl:ServiceName><tsl:Name xml:lang="en">Example QC CA G0</tsl:Name></tsl:ServiceName>
            <tsl:ServiceDigitalIdentity><tsl:DigitalId>
              <tsl:X509Certificate>${b64('ca-qc-withdrawn')}</tsl:X509Certificate>
            </tsl:DigitalId></tsl:ServiceDigitalIdentity>
            <tsl:ServiceStatus>${ST}withdrawn</tsl:ServiceStatus>
            <tsl:StatusStartingTime>2022-01-01T00:00:00Z</tsl:StatusStartingTime>
            ${usage('ForeSignatures')}
          </tsl:ServiceInformation>
          <tsl:ServiceHistory>
            <tsl:ServiceHistoryInstance>
              <tsl:ServiceTypeIdentifier>${SVC}CA/QC</tsl:ServiceTypeIdentifier>
              <tsl:ServiceName><tsl:Name xml:lang="en">Example QC CA G0</tsl:Name></tsl:ServiceName>
              <tsl:ServiceDigitalIdentity><tsl:DigitalId>
                <tsl:X509SKI>${skiB64('ca-qc-withdrawn')}</tsl:X509SKI>
              </tsl:DigitalId></tsl:ServiceDigitalIdentity>
              <tsl:ServiceStatus>${ST}granted</tsl:ServiceStatus>
              <tsl:StatusStartingTime>2016-07-01T00:00:00Z</tsl:StatusStartingTime>
              ${usage('ForeSignatures')}
            </tsl:ServiceHistoryInstance>
            <tsl:ServiceHistoryInstance>
              <tsl:ServiceTypeIdentifier>${SVC}CA/QC</tsl:ServiceTypeIdentifier>
              <tsl:ServiceName><tsl:Name xml:lang="en">Example QC CA G0</tsl:Name></tsl:ServiceName>
              <tsl:ServiceDigitalIdentity><tsl:DigitalId>
                <tsl:X509SKI>${skiB64('ca-qc-withdrawn')}</tsl:X509SKI>
              </tsl:DigitalId></tsl:ServiceDigitalIdentity>
              <tsl:ServiceStatus>${ST}undersupervision</tsl:ServiceStatus>
              <tsl:StatusStartingTime>2012-01-01T00:00:00Z</tsl:StatusStartingTime>
            </tsl:ServiceHistoryInstance>
          </tsl:ServiceHistory>
        </tsl:TSPService>
        <tsl:TSPService>
          <tsl:ServiceInformation>
            <tsl:ServiceTypeIdentifier>${SVC}TSA/QTST</tsl:ServiceTypeIdentifier>
            <tsl:ServiceName><tsl:Name xml:lang="en">Example QTST</tsl:Name></tsl:ServiceName>
            <tsl:ServiceDigitalIdentity><tsl:DigitalId>
              <tsl:X509Certificate>${b64('tsa-qtst')}</tsl:X509Certificate>
            </tsl:DigitalId></tsl:ServiceDigitalIdentity>
            <tsl:ServiceStatus>${ST}granted</tsl:ServiceStatus>
            <tsl:StatusStartingTime>2017-01-01T00:00:00Z</tsl:StatusStartingTime>
          </tsl:ServiceInformation>
        </tsl:TSPService>
      </tsl:TSPServices>
    </tsl:TrustServiceProvider>
  </tsl:TrustServiceProviderList>
  <ds:Signature Id="sig"/>
</tsl:TrustServiceStatusList>`;

/** A second, empty national list "XY" (default namespace, no prefix). */
export const xyTrustedList = () => `<?xml version="1.0" encoding="UTF-8"?>
<TrustServiceStatusList xmlns="http://uri.etsi.org/02231/v2#">
  <SchemeInformation>
    <TSLVersionIdentifier>5</TSLVersionIdentifier>
    <TSLType>http://uri.etsi.org/TrstSvc/TrustedList/TSLType/EUgeneric</TSLType>
    <SchemeTerritory>XY</SchemeTerritory>
    <NextUpdate><dateTime>2099-01-01T00:00:00Z</dateTime></NextUpdate>
  </SchemeInformation>
</TrustServiceStatusList>`;

const pointer = (
  location: string,
  territory: string,
  type: string,
  mime: string,
  cert?: string,
) => `
    <OtherTSLPointer>
      <ServiceDigitalIdentities><ServiceDigitalIdentity><DigitalId>
        ${cert ? `<X509Certificate>${cert}</X509Certificate>` : ''}
      </DigitalId></ServiceDigitalIdentity></ServiceDigitalIdentities>
      <TSLLocation>${location}</TSLLocation>
      <AdditionalInformation>
        <OtherInformation><TSLType>http://uri.etsi.org/TrstSvc/TrustedList/TSLType/${type}</TSLType></OtherInformation>
        <OtherInformation><SchemeTerritory>${territory}</SchemeTerritory></OtherInformation>
        <OtherInformation><ns3:MimeType>${mime}</ns3:MimeType></OtherInformation>
      </AdditionalInformation>
    </OtherTSLPointer>`;

/** LoTL (default namespace) pointing at itself, ZZ (XML + PDF) and XY. */
export const lotl = () => `<?xml version="1.0" encoding="UTF-8"?>
<TrustServiceStatusList xmlns="http://uri.etsi.org/02231/v2#" xmlns:ns3="http://uri.etsi.org/02231/v2/additionaltypes#">
  <SchemeInformation>
    <TSLVersionIdentifier>6</TSLVersionIdentifier>
    <TSLSequenceNumber>400</TSLSequenceNumber>
    <TSLType>http://uri.etsi.org/TrstSvc/TrustedList/TSLType/EUlistofthelists</TSLType>
    <SchemeTerritory>EU</SchemeTerritory>
    <PointersToOtherTSL>
      ${pointer(LOTL_URL, 'EU', 'EUlistofthelists', 'application/vnd.etsi.tsl+xml')}
      ${pointer(ZZ_TL_URL, 'ZZ', 'EUgeneric', 'application/vnd.etsi.tsl+xml', b64('unlisted-ca'))}
      ${pointer('https://tl.zz.example/tl.pdf', 'ZZ', 'EUgeneric', 'application/pdf')}
      ${pointer(XY_TL_URL, 'XY', 'EUgeneric', 'application/vnd.etsi.tsl+xml')}
    </PointersToOtherTSL>
    <NextUpdate><dateTime>2099-01-01T00:00:00Z</dateTime></NextUpdate>
  </SchemeInformation>
</TrustServiceStatusList>`;
