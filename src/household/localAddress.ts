// The QR-displaying phone needs its own LAN IP to embed in the pairing QR
// (§5.11). Native-only (expo-network).
import * as Network from 'expo-network';
import { formatAddress } from './address';

export async function getLocalAddress(): Promise<string> {
  const ip = await Network.getIpAddressAsync();
  return formatAddress(ip);
}
