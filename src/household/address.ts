// §7.5: last_known_address is stored as 'ip:port'. Pure parsing, no native
// dependency — kept separate from tcpChannel.ts/localAddress.ts so it's
// unit-testable.
export const SYNC_PORT = 51830;

export function formatAddress(host: string, port: number = SYNC_PORT): string {
  return `${host}:${port}`;
}

export class InvalidAddressError extends Error {}

export function parseAddress(address: string): { host: string; port: number } {
  const idx = address.lastIndexOf(':');
  if (idx <= 0 || idx === address.length - 1) {
    throw new InvalidAddressError(`Malformed address: ${address}`);
  }
  const host = address.slice(0, idx);
  const port = Number(address.slice(idx + 1));
  if (!Number.isInteger(port) || port <= 0) {
    throw new InvalidAddressError(`Malformed port in address: ${address}`);
  }
  return { host, port };
}
