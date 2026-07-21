import { describe, expect, it } from 'vitest';
import { formatAddress, InvalidAddressError, parseAddress, SYNC_PORT } from '../../household/address';

describe('household address parsing (§7.5)', () => {
  it('formats host:port with the default sync port', () => {
    expect(formatAddress('192.168.1.24')).toBe(`192.168.1.24:${SYNC_PORT}`);
    expect(formatAddress('192.168.1.24', 5883)).toBe('192.168.1.24:5883');
  });

  it('round-trips through parse', () => {
    expect(parseAddress('192.168.1.24:51830')).toEqual({ host: '192.168.1.24', port: 51830 });
  });

  it('rejects malformed addresses', () => {
    expect(() => parseAddress('no-port-here')).toThrow(InvalidAddressError);
    expect(() => parseAddress('192.168.1.24:')).toThrow(InvalidAddressError);
    expect(() => parseAddress('192.168.1.24:notanumber')).toThrow(InvalidAddressError);
    expect(() => parseAddress(':5883')).toThrow(InvalidAddressError);
  });
});
