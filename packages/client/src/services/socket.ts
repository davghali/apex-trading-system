import { io, Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001');

export type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting' | 'error';

let _connectionStatus: ConnectionStatus = 'disconnected';
let _reconnectAttempt = 0;
const MAX_RECONNECT_DELAY = 30000;

export const socket: Socket = io(SOCKET_URL, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: MAX_RECONNECT_DELAY,
  transports: ['polling', 'websocket'],
  timeout: 20000,
});

// Connection lifecycle logging
socket.on('connect', () => {
  _connectionStatus = 'connected';
  _reconnectAttempt = 0;
  console.log('[Socket] Connected:', socket.id);
});

socket.on('disconnect', (reason) => {
  _connectionStatus = 'disconnected';
  console.log('[Socket] Disconnected:', reason);

  // If server disconnected us, try to reconnect
  if (reason === 'io server disconnect') {
    console.log('[Socket] Server initiated disconnect, attempting reconnect...');
    socket.connect();
  }
});

socket.on('connect_error', (error) => {
  _connectionStatus = 'error';
  _reconnectAttempt++;
  const delay = Math.min(1000 * Math.pow(2, _reconnectAttempt), MAX_RECONNECT_DELAY);
  console.error(
    `[Socket] Connection error (attempt ${_reconnectAttempt}, next retry in ${delay}ms):`,
    error.message
  );
});

socket.io.on('reconnect_attempt', (attempt) => {
  _connectionStatus = 'reconnecting';
  _reconnectAttempt = attempt;
  console.log(`[Socket] Reconnection attempt ${attempt}`);
});

socket.io.on('reconnect', (attempt) => {
  _connectionStatus = 'connected';
  _reconnectAttempt = 0;
  console.log(`[Socket] Reconnected after ${attempt} attempts`);
});

socket.io.on('reconnect_failed', () => {
  _connectionStatus = 'error';
  console.error('[Socket] Reconnection failed after max attempts');
});

export function getConnectionStatus(): ConnectionStatus {
  return _connectionStatus;
}

export function getReconnectAttempt(): number {
  return _reconnectAttempt;
}

export function connectSocket(): void {
  if (!socket.connected) {
    _connectionStatus = 'reconnecting';
    socket.connect();
  }
}

export function disconnectSocket(): void {
  if (socket.connected) {
    socket.disconnect();
  }
  _connectionStatus = 'disconnected';
}

export default socket;
