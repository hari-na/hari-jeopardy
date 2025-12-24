
import { Peer, DataConnection } from 'peerjs';
import { GameState, Player, SyncMessage } from '../types';

let peer: Peer | null = null;
let connections: DataConnection[] = [];
let hostConnection: DataConnection | null = null;
let currentRoomCode = '';
let currentPlayerId = '';

export const PEER_PREFIX = 'HARI-JEOPARDY-';

const PEER_CONFIG = {
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
    ],
    iceCandidatePoolSize: 10,
  }
};

export const generateRoomCode = () => {
  const chars = 'ABCDEFGHIJKLMNPQRSTUVWXYZ';
  return Array.from({ length: 4 }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
};

/**
 * HOST LOGIC
 */
export const initHost = (
  roomCode: string,
  onMessage: (msg: SyncMessage, senderPeerId: string) => void,
  onDisconnect?: (peerId: string) => void
): Promise<string> => {
  return new Promise((resolve, reject) => {
    // If we already have a peer input for this room, we might be re-initializing.
    if (peer && !peer.destroyed) {
      peer.destroy();
    }

    currentRoomCode = roomCode;
    // Allow a small delay for destruction
    setTimeout(() => {
      peer = new Peer(`${PEER_PREFIX}${roomCode}`, PEER_CONFIG);

      peer.on('open', (id) => {
        console.log('Host Peer opened with ID:', id);
        resolve(id);
      });

      peer.on('connection', (conn) => {
        console.log('New player connecting:', conn.peer);
        connections.push(conn);

        conn.on('data', (data: any) => {
          onMessage(data as SyncMessage, conn.peer);
        });

        conn.on('close', () => {
          console.log('Connection closed:', conn.peer);
          connections = connections.filter(c => c !== conn);
          if (onDisconnect) onDisconnect(conn.peer);
        });

        conn.on('error', (err) => {
          console.error('Connection error for peer:', conn.peer, err);
          connections = connections.filter(c => c !== conn);
          if (onDisconnect) onDisconnect(conn.peer);
        });
      });

      peer.on('error', (err) => {
        console.error('Peer error:', err);
        // If ID taken, could retry or just reject
        reject(err);
      });
    }, 500);
  });
};

export const destroyPeer = () => {
  if (peer) {
    peer.destroy();
    peer = null;
    connections = [];
  }
};

export const broadcastState = (state: GameState) => {
  const msg: SyncMessage = {
    type: 'UPDATE_STATE',
    payload: state,
    senderId: 'HOST'
  };
  connections.forEach(conn => {
    if (conn.open) {
      conn.send(msg);
    }
  });
};

export const sendToPeer = (peerId: string, msg: SyncMessage) => {
  const conn = connections.find(c => c.peer === peerId);
  if (conn && conn.open) {
    conn.send(msg);
  }
};

/**
 * PLAYER LOGIC
 */
export const initPlayer = (
  roomCode: string,
  playerName: string,
  onMessage: (msg: SyncMessage) => void,
  onAttempt?: (attempt: number) => void,
  maxRetries = 3
): Promise<Player> => {
  let attempt = 0;

  const attemptConnection = (): Promise<Player> => {
    return new Promise((resolve, reject) => {
      attempt++;
      let failed = false;
      console.log(`[Attempt ${attempt}] Initializing for room ${roomCode}...`);
      if (onAttempt) onAttempt(attempt);

      if (peer && !peer.destroyed) {
        peer.destroy();
      }

      currentPlayerId = Math.random().toString(36).substring(7);
      peer = new Peer(PEER_CONFIG);

      let connectionTimeout: any = null;

      const cleanup = () => {
        if (connectionTimeout) clearTimeout(connectionTimeout);
      };

      const handleFailure = (err: any) => {
        if (failed) return;
        failed = true;
        cleanup();

        const errorType = err?.type || err?.message || 'unknown';
        console.warn(`[Attempt ${attempt}] Failed: ${errorType}`);

        if (attempt < maxRetries) {
          console.log(`[Attempt ${attempt}] Retrying in 2 seconds...`);
          setTimeout(() => {
            attemptConnection().then(resolve).catch(reject);
          }, 2000);
        } else {
          reject(err);
        }
      };

      // Start the global timeout for this specific attempt immediately
      connectionTimeout = setTimeout(() => {
        handleFailure(new Error('Connection timed out'));
      }, 10000); // 10 second total timeout per attempt

      peer.on('open', (id) => {
        console.log(`[Attempt ${attempt}] Peer opened with ID: ${id}`);
        console.log(`[Attempt ${attempt}] Connecting to host: ${PEER_PREFIX}${roomCode}`);

        const conn = peer!.connect(`${PEER_PREFIX}${roomCode}`, {
          reliable: true
        });
        hostConnection = conn;

        conn.on('open', () => {
          cleanup();
          console.log(`[Attempt ${attempt}] Data channel open!`);
          const joinMsg: SyncMessage = {
            type: 'PLAYER_JOIN',
            payload: {
              name: playerName,
              id: currentPlayerId,
              score: 0,
              isBuzzed: false
            },
            senderId: currentPlayerId
          };
          conn.send(joinMsg);

          resolve({
            id: currentPlayerId,
            name: playerName,
            score: 0,
            isBuzzed: false
          });
        });

        conn.on('data', (data: any) => {
          onMessage(data as SyncMessage);
        });

        conn.on('error', (err) => {
          handleFailure(err);
        });

        conn.on('close', () => {
          handleFailure(new Error('Connection closed by host'));
        });
      });

      peer.on('error', (err) => {
        handleFailure(err);
      });
    });
  };

  return attemptConnection();
};

export const sendAction = (type: SyncMessage['type'], payload: any) => {
  if (hostConnection && hostConnection.open) {
    const msg: SyncMessage = {
      type,
      payload,
      senderId: currentPlayerId
    };
    hostConnection.send(msg);
  }
};

// Legacy support if needed, but we should move away from it
export const saveRoomState = (roomCode: string, state: Partial<GameState>) => {
  // This will be handled by the HostView component calling broadcastState
};

export const getRoomState = (roomCode: string): GameState | null => {
  return null; // State is now pushed via PeerJS
};
