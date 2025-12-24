
import { Peer, DataConnection } from 'peerjs';
import { GameState, Player, SyncMessage } from '../types';

let peer: Peer | null = null;
let connections: DataConnection[] = [];
let hostConnection: DataConnection | null = null;
let currentRoomCode = '';
let currentPlayerId = '';

const PEER_PREFIX = 'HARI-JEOPARDY-';

export const generateRoomCode = () => {
  const chars = 'ABCDEFGHIJKLMNPQRSTUVWXYZ';
  return Array.from({ length: 4 }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
};

/**
 * HOST LOGIC
 */
export const initHost = (roomCode: string, onMessage: (msg: SyncMessage) => void): Promise<string> => {
  return new Promise((resolve, reject) => {
    // If we already have a peer input for this room, we might be re-initializing.
    if (peer && !peer.destroyed) {
      peer.destroy();
    }

    currentRoomCode = roomCode;
    // Allow a small delay for destruction
    setTimeout(() => {
      peer = new Peer(`${PEER_PREFIX}${roomCode}`);

      peer.on('open', (id) => {
        console.log('Host Peer opened with ID:', id);
        resolve(id);
      });

      peer.on('connection', (conn) => {
        console.log('New player connecting:', conn.peer);
        connections.push(conn);

        conn.on('data', (data: any) => {
          onMessage(data as SyncMessage);
        });

        conn.on('close', () => {
          connections = connections.filter(c => c !== conn);
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

/**
 * PLAYER LOGIC
 */
export const initPlayer = (roomCode: string, playerName: string, onMessage: (msg: SyncMessage) => void): Promise<Player> => {
  return new Promise((resolve, reject) => {
    currentPlayerId = Math.random().toString(36).substring(7);
    peer = new Peer(); // Players get a random ID

    peer.on('open', (id) => {
      console.log('Player Peer opened with ID:', id);
      const conn = peer!.connect(`${PEER_PREFIX}${roomCode}`);
      hostConnection = conn;

      conn.on('open', () => {
        console.log('Connected to host');
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

        // Return the player object once connected
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
        console.error('Connection error:', err);
        reject(err);
      });

      conn.on('close', () => {
        console.warn('Host connection closed');
      });
    });

    peer.on('error', (err) => {
      console.error('Peer error:', err);
      reject(err);
    });
  });
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
