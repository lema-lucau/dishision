// RFC 4122 v4 UUID. Math.random is sufficient here — these ids need to be
// unique, not cryptographically unguessable (contrast sync_secret, §7.5,
// which will need real entropy when S15 lands).
export function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
