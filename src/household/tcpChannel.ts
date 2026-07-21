// §7.5 transport: react-native-tcp-socket + NDJSON framing, implementing
// the SyncChannel interface the pure protocol logic (syncProtocol.ts) runs
// against. Native-only — can't run under Vitest (§11.1 boundary pattern);
// the protocol itself is tested against the in-memory fake channel instead.
import TcpSocket from 'react-native-tcp-socket';
import { logger } from '../debug/logStore';
import { SyncConnectionClosedError, type SyncChannel, type SyncMessage } from './syncTypes';

interface Waiter {
  resolve: (msg: SyncMessage) => void;
  reject: (err: Error) => void;
}

function wrapSocket(socket: InstanceType<typeof TcpSocket.Socket>): SyncChannel {
  socket.setEncoding('utf8');
  let buffer = '';
  let closed = false;
  const inbox: SyncMessage[] = [];
  const waiters: Waiter[] = [];

  function deliver(message: SyncMessage): void {
    const waiter = waiters.shift();
    if (waiter) waiter.resolve(message);
    else inbox.push(message);
  }

  function failAll(err: Error): void {
    if (closed) return;
    closed = true;
    for (const waiter of waiters) waiter.reject(err);
    waiters.length = 0;
  }

  socket.on('data', (chunk: string | Buffer) => {
    buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      if (!line.trim()) continue;
      try {
        deliver(JSON.parse(line) as SyncMessage);
      } catch (error) {
        logger.warn('sync', 'Dropped malformed sync message', { error: String(error) });
      }
    }
  });
  socket.on('error', (error: Error) => {
    logger.warn('sync', 'Sync socket error', { error: String(error) });
    failAll(new SyncConnectionClosedError(String(error)));
  });
  socket.on('close', () => failAll(new SyncConnectionClosedError('Connection closed')));

  return {
    async send(message) {
      if (closed) throw new SyncConnectionClosedError('Connection closed');
      socket.write(`${JSON.stringify(message)}\n`);
    },
    async receive() {
      if (inbox.length > 0) return inbox.shift()!;
      if (closed) throw new SyncConnectionClosedError('Connection closed');
      const promise = new Promise<SyncMessage>((resolve, reject) => {
        waiters.push({ resolve, reject });
      });
      promise.catch(() => {});
      return promise;
    },
    close() {
      if (closed) return;
      closed = true;
      socket.destroy();
    },
  };
}

// §7.5: "the phone whose profile screen initiated contact connects out."
export function connectToPeer(host: string, port: number): Promise<SyncChannel> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const socket = TcpSocket.createConnection({ port, host }, () => {
      if (settled) return;
      settled = true;
      resolve(wrapSocket(socket));
    });
    socket.on('error', (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
  });
}

export interface SyncListener {
  close(): void;
}

// §7.5: "the other phone listens on an ephemeral port opened only while
// its pairing/sync screen is visible. The listener closes the socket the
// moment the screen is left" — callers own that lifecycle (mount/unmount).
export function startListener(port: number, onConnection: (channel: SyncChannel) => void): SyncListener {
  const server = TcpSocket.createServer((socket) => {
    onConnection(wrapSocket(socket));
  });
  server.on('error', (error: Error) => {
    logger.warn('sync', 'Sync listener error', { error: String(error) });
  });
  server.listen({ port, host: '0.0.0.0' });
  return {
    close: () => {
      server.close();
    },
  };
}
