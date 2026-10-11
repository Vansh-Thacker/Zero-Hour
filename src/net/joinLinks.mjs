// Public join links only: never put a host/seat token in a shared URL.
export function phoneAddress(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    if (host === 'localhost' || host.endsWith('.localhost') || host === '0.0.0.0' ||
        host === '[::]' || host === '[::1]' || /^127\./.test(host) ||
        /^169\.254\./.test(host) || /^\[fe[89ab]/.test(host)) return null;
    return url;
  } catch { return null; }
}

function networkRank(url) {
  const host = new URL(url).hostname;
  if (/^192\.168\./.test(host)) return 0;
  if (/^10\./.test(host)) return 1;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return 2;
  return 3;
}

export function joinLinks(addresses, code) {
  if (!Array.isArray(addresses) || typeof code !== 'string' || !code.trim()) return [];
  const links = addresses.flatMap(value => {
    const address = phoneAddress(value);
    if (!address) return [];
    const link = new URL('/play.html', address.origin);
    link.searchParams.set('code', code);
    return [link.href];
  });
  return [...new Set(links)].sort((a, b) => networkRank(a) - networkRank(b));
}

// A deployed site (or a LAN IP opened by the host) takes precedence over adapter IPs.
export function phoneJoinLinks(origin, addresses, code) {
  return joinLinks(phoneAddress(origin) ? [origin] : addresses, code);
}
