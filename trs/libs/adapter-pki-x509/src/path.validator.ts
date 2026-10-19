import { Certificate, isIssuedBy, isSelfIssued } from './certificate';

export interface PathInput {
  leaf: Certificate;
  anchors: Certificate[];
  intermediates: Certificate[];
  at: Date;
  maxIntermediates: number;
}

export type PathResult =
  { valid: true; chain: Certificate[] } | { valid: false; reasons: string[] };

export const subjectCn = (c: Certificate): string =>
  /(?:^|\n)CN=([^\n]*)/.exec(c.x509.subject)?.[1] ?? c.sha256.slice(0, 16);

export function validatePath(input: PathInput): PathResult {
  const anchors = new Map(input.anchors.map((a) => [a.sha256, a]));
  const pool = [...input.anchors, ...input.intermediates];
  const reasons: string[] = [];

  if (anchors.has(input.leaf.sha256)) {
    const why = checkValidity(input.leaf, input.at);
    if (!why) return { valid: true, chain: [input.leaf] };
    reasons.push(why);
  }

  const paths: Certificate[][] = [];
  const extend = (path: Certificate[]) => {
    const current = path[path.length - 1];
    if (path.length > input.maxIntermediates + 1) return;
    for (const candidate of pool) {
      if (path.some((c) => c.sha256 === candidate.sha256)) continue;
      if (!isIssuedBy(current, candidate)) continue;
      const next = [...path, candidate];
      if (anchors.has(candidate.sha256)) paths.push(next);
      else extend(next);
    }
  };
  extend([input.leaf]);

  if (!paths.length && !reasons.length) {
    return {
      valid: false,
      reasons: [`${subjectCn(input.leaf)} does not chain to a trust anchor`],
    };
  }
  for (const chain of paths) {
    const why = checkPath(chain, input.at);
    if (!why) return { valid: true, chain };
    reasons.push(why);
  }
  return { valid: false, reasons: [...new Set(reasons)] };
}

function checkValidity(c: Certificate, at: Date): string | undefined {
  if (at < c.notBefore) return `${subjectCn(c)} is not yet valid`;
  if (at > c.notAfter) return `${subjectCn(c)} has expired`;
  return undefined;
}

function checkPath(chain: Certificate[], at: Date): string | undefined {
  for (let i = 0; i < chain.length; i++) {
    const cert = chain[i];
    const isAnchor = i === chain.length - 1;

    const validity = checkValidity(cert, at);
    if (validity) return validity;

    if (!isAnchor && cert.unhandledCritical.length) {
      return `${subjectCn(cert)} has unsupported critical extension(s) ${cert.unhandledCritical.join(', ')}`;
    }
    if (i === 0) continue;

    if (!cert.basicConstraints?.ca) {
      return `${subjectCn(cert)} is not a CA certificate`;
    }
    if (cert.keyUsage && !cert.keyUsage.has('keyCertSign')) {
      return `${subjectCn(cert)} may not sign certificates (keyUsage)`;
    }
    const pathLength = cert.basicConstraints.pathLength;
    if (pathLength !== undefined) {
      const below = chain.slice(1, i).filter((c) => !isSelfIssued(c)).length;
      if (below > pathLength) {
        return `${subjectCn(cert)} path length constraint (${pathLength}) exceeded`;
      }
    }
  }
  return undefined;
}
