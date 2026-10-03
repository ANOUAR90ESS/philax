import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { AppError } from '@philax/types';

/** IPv4 ranges that must never be fetched (loopback, private, link-local, CGNAT, metadata, multicast…). */
const BLOCKED_V4: [string, number][] = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

function v4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

export function isBlockedIPv4(ip: string): boolean {
  const n = v4ToInt(ip);
  return BLOCKED_V4.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (n & mask) === (v4ToInt(base) & mask);
  });
}

export function isBlockedIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::' || lower === '::1') return true;
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped?.[1]) return isBlockedIPv4(mapped[1]);
  // fc00::/7 unique local, fe80::/10 link-local, ff00::/8 multicast, 2001:db8::/32 documentation.
  return /^(f[cd]|fe[89ab]|ff)/.test(lower) || lower.startsWith('2001:db8');
}

export function isBlockedIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return isBlockedIPv4(ip);
  if (family === 6) return isBlockedIPv6(ip);
  return true;
}

export type Resolver = (hostname: string) => Promise<string[]>;

export const systemResolver: Resolver = async (hostname) =>
  (await lookup(hostname, { all: true, verbatim: true })).map((a) => a.address);

/**
 * Validates that a URL is a public http(s) web address: no credentials, standard
 * ports only, and every resolved address public (SSRF protection, §33–34).
 */
export async function assertPublicUrl(
  raw: string,
  resolve: Resolver = systemResolver,
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AppError('URL_NOT_ALLOWED', 'The link is not a valid URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new AppError('URL_NOT_ALLOWED', 'Only http and https links are supported.');
  }
  if (url.username || url.password)
    throw new AppError('URL_NOT_ALLOWED', 'Links with credentials are not allowed.');
  if (url.port && url.port !== '80' && url.port !== '443') {
    throw new AppError('URL_NOT_ALLOWED', 'Only standard web ports are allowed.');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.internal') ||
    host.endsWith('.local')
  ) {
    throw new AppError('URL_NOT_ALLOWED', 'That link points to a private address.');
  }
  let addresses: string[];
  if (isIP(host)) addresses = [host];
  else {
    try {
      addresses = await resolve(host);
    } catch (err) {
      throw new AppError('EXTRACTION_FAILED', 'The website could not be found.', { cause: err });
    }
  }
  if (addresses.length === 0 || addresses.some(isBlockedIp)) {
    throw new AppError('URL_NOT_ALLOWED', 'That link points to a private address.');
  }
  return url;
}
