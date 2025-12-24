
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { GameState, Player, SyncMessage } from '../types';
import { initPlayer, sendAction } from '../services/gameSync';

interface PlayerViewProps {
  roomCode: string;
  playerName: string;
}

const PlayerView: React.FC<PlayerViewProps> = ({ roomCode, playerName }) => {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [localPlayerId, setLocalPlayerId] = useState<string>('');
  const [connecting, setConnecting] = useState(true);
  const [attempt, setAttempt] = useState(1);
  const [kicked, setKicked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleMessage = useCallback((msg: SyncMessage) => {
    if (msg.type === 'UPDATE_STATE') {
      setGameState(msg.payload as GameState);
    } else if (msg.type === 'KICKED') {
      setKicked(true);
      // peer connection might stay open or close, but UI should block
    }
  }, []);

  useEffect(() => {
    const setup = async () => {
      try {
        setConnecting(true);
        setError(null);
        const player = await initPlayer(roomCode, playerName, handleMessage, (a) => setAttempt(a));
        setLocalPlayerId(player.id);
      } catch (err: any) {
        console.error(err);
        const type = err?.type || 'unknown';
        setError(`Failed after multiple attempts (${type}). Is the host active and online?`);
      } finally {
        setConnecting(false);
      }
    };

    setup();
  }, [roomCode, playerName, handleMessage]);

  const [isShaking, setIsShaking] = useState(false);

  const handleBuzz = () => {
    if (!gameState || gameState.status !== 'QUESTION_ACTIVE' || gameState.activePlayerId) return;

    const player = gameState.players.find(p => p.id === localPlayerId);
    const now = Date.now();
    const isGlobalLocked = gameState.buzzerLockUntil && now < gameState.buzzerLockUntil;
    const isLocalLocked = player?.buzzerLockUntil && now < player.buzzerLockUntil;

    if (isGlobalLocked || isLocalLocked) {
      console.warn('Buzzer is locked! Timer reset.');
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 400);
      sendAction('BUZZ_LOCKED_ATTEMPT', null);
      return;
    }
    sendAction('BUZZ', null);
  };

  const player = gameState?.players.find(p => p.id === localPlayerId);
  const now = Date.now();
  const isBuzzerLocked = (gameState?.buzzerLockUntil && now < gameState.buzzerLockUntil) || (player?.buzzerLockUntil && now < player.buzzerLockUntil);

  const [isUnlocking, setIsUnlocking] = useState(false);
  const prevLocked = useRef(isBuzzerLocked);

  useEffect(() => {
    if (prevLocked.current && !isBuzzerLocked) {
      setIsUnlocking(true);
      const timer = setTimeout(() => setIsUnlocking(false), 600);
      return () => clearTimeout(timer);
    }
    prevLocked.current = isBuzzerLocked;
  }, [isBuzzerLocked]);

  // Force re-render when buzzer lock expires
  const [, forceUpdate] = useState({});
  useEffect(() => {
    if (isBuzzerLocked) {
      const lockTime = Math.max(gameState?.buzzerLockUntil || 0, player?.buzzerLockUntil || 0);
      const timeout = setTimeout(() => forceUpdate({}), lockTime - Date.now() + 10);
      return () => clearTimeout(timeout);
    }
  }, [isBuzzerLocked, gameState?.buzzerLockUntil, player?.buzzerLockUntil]);

  if (connecting) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="font-game text-xl">Connecting to room {roomCode}...</p>
        <p className="text-slate-500 text-xs mt-2 uppercase tracking-widest font-bold">Attempt {attempt} of 3</p>
      </div>
    );
  }

  if (error) {
    const isPeerUnavailable = error.includes('peer-unavailable');
    const isNetworkError = error.includes('network') || error.includes('Handshake');

    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-red-950/30 border-2 border-red-500/50 p-8 rounded-3xl max-w-sm">
          <div className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
          </div>
          <p className="text-red-400 font-bold mb-2">CONNECTION FAILED</p>
          <p className="text-sm text-slate-300 mb-6">{error}</p>

          <div className="bg-slate-900/50 p-4 rounded-xl text-left border border-slate-800 mb-6">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Troubleshooting</p>
            <ul className="text-xs space-y-2 text-slate-400">
              {isPeerUnavailable && <li>• Verify the Room Code is correct on the big screen.</li>}
              {isNetworkError && <li>• Your Wi-Fi might be blocking the connection. Try switching to **Mobile Data**.</li>}
              <li>• Ask the host to refresh their screen and try a new code.</li>
            </ul>
          </div>

          <button
            onClick={() => window.location.reload()}
            className="w-full bg-slate-800 hover:bg-slate-700 px-6 py-4 rounded-xl font-bold transition-all active:scale-95 border border-slate-700"
          >
            TRY AGAIN
          </button>
        </div>
      </div>
    );
  }

  if (kicked) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-6 border-2 border-red-500/50">
          <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </div>
        <h1 className="font-game text-4xl text-red-500 mb-2">KICKED</h1>
        <p className="text-slate-400 mb-8">You have been removed from the game.</p>
        <button
          onClick={() => window.location.reload()}
          className="bg-slate-800 text-white px-8 py-4 rounded-xl font-bold border border-slate-700 active:scale-95 transition-all"
        >
          RETURN TO LOBBY
        </button>
      </div>
    );
  }

  if (!gameState) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 text-center">
        <p className="font-game animate-pulse">Waiting for game data...</p>
      </div>
    );
  }

  if (!player) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 text-center">
        <p className="font-game text-xl">Waiting for host to accept...</p>
        <p className="text-slate-500 text-xs mt-2">ID: {localPlayerId}</p>
      </div>
    );
  }

  const isMyTurn = gameState.activePlayerId === localPlayerId;

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-between p-6">

      {/* Top HUD */}
      <div className="w-full flex justify-between items-start">
        <div className="space-y-1">
          <p className="font-game text-2xl">{player.name}</p>
          <p className="text-blue-400 font-bold">₹{player.score}</p>
        </div>
        <div className="bg-slate-800 px-4 py-2 rounded-xl text-center">
          <p className="text-[10px] text-slate-500 font-bold">CODE</p>
          <p className="font-game text-lg">{roomCode}</p>
        </div>
      </div>

      {/* Main interaction */}
      <div className="flex-grow flex flex-col items-center justify-center w-full">
        {gameState.status === 'LOBBY' && (
          <div className="text-center space-y-4 animate-float">
            <div className="w-24 h-24 bg-purple-600 rounded-full mx-auto flex items-center justify-center shadow-2xl border-4 border-purple-400">
              <span className="text-4xl font-game">?</span>
            </div>
            <p className="font-game text-xl text-purple-400">YOU'RE IN!</p>
            <p className="text-slate-500 text-sm">Waiting for host to start...</p>
          </div>
        )}

        {gameState.status === 'INTRO' && (
          <div className="text-center space-y-12 animate-impact">
            <div className="relative inline-block">
              <div className="w-32 h-32 bg-blue-600 rounded-full mx-auto flex items-center justify-center border-4 border-blue-400 shadow-[0_0_30px_rgba(37,99,235,0.6)] flare-container">
                <div className="flare-overlay" />
                <span className="text-6xl font-game text-white animate-vibrate">!</span>
              </div>
            </div>
            <div className="space-y-2">
              <p className="font-game text-4xl text-blue-400 tracking-tighter">GET READY</p>
              <p className="text-slate-500 font-bold uppercase text-[10px] tracking-[0.3em]">The Fight Begins</p>
            </div>
          </div>
        )}

        {gameState.status === 'PLAYING' && (
          <div className="text-center space-y-4">
            <p className="font-game text-2xl text-blue-500 animate-pulse">BOARD IS ACTIVE</p>
            <p className="text-slate-400">Look at the big screen to see categories.</p>
          </div>
        )}

        {gameState.status === 'QUESTION_ACTIVE' && (
          <div className="w-full max-w-sm space-y-8">
            {gameState.activeQuestion && (
              <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 mb-4 animate-in fade-in slide-in-from-bottom-4">
                <p className="text-[10px] text-blue-400 font-bold uppercase tracking-widest mb-2">{gameState.activeQuestion.category}</p>
                <p className="text-lg font-bold leading-tight">{gameState.activeQuestion.question}</p>
                {gameState.activeQuestion.isGolden && !gameState.activeQuestion.isRed && <p className="text-yellow-500 text-xs font-bold mt-2 animate-pulse">✨ GOLDEN QUESTION ✨</p>}
                {gameState.activeQuestion.isRed && <p className="text-red-500 text-xs font-bold mt-2 animate-pulse font-black">⚠️ RED QUESTION (4x) ⚠️</p>}
              </div>
            )}
            {!gameState.activePlayerId ? (
              <div className="relative w-full aspect-square max-w-[300px]">
                {/* LOCK OVERLAY */}
                {(isBuzzerLocked || isUnlocking) && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                    {/* Horizontal Chains */}
                    <div className="absolute inset-0 flex flex-col justify-around py-12 overflow-hidden">
                      <div className={`flex justify-center -rotate-12 translate-x-4 ${isUnlocking ? 'animate-chain-out-left' : 'animate-chain-left'}`}>
                        {[1, 2, 3, 4, 5, 6].map(i => (
                          <svg key={`c1-${i}`} viewBox="0 0 100 40" className="w-16 h-8 -ml-4" xmlns="http://www.w3.org/2000/svg">
                            <rect x="10" y="10" width="80" height="20" rx="10" className="fill-slate-600 stroke-slate-900 stroke-2" />
                            <rect x="25" y="15" width="50" height="10" rx="5" className="fill-slate-800" />
                          </svg>
                        ))}
                      </div>
                      <div className={`flex justify-center rotate-12 -translate-x-4 ${isUnlocking ? 'animate-chain-out-right' : 'animate-chain-right'}`}>
                        {[1, 2, 3, 4, 5, 6].map(i => (
                          <svg key={`c2-${i}`} viewBox="0 0 100 40" className="w-16 h-8 -ml-4" xmlns="http://www.w3.org/2000/svg">
                            <rect x="10" y="10" width="80" height="20" rx="10" className="fill-slate-600 stroke-slate-900 stroke-2" />
                            <rect x="25" y="15" width="50" height="10" rx="5" className="fill-slate-800" />
                          </svg>
                        ))}
                      </div>
                    </div>

                    {/* Central Lock Icon */}
                    <div className={`bg-slate-900/90 p-8 rounded-full border-4 border-slate-700 shadow-[0_0_50px_rgba(0,0,0,0.8)] backdrop-blur-md z-30 ${isUnlocking ? 'animate-chain-lift' : 'animate-chain-drop'}`}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-yellow-500 neon-text">
                        <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                    </div>
                  </div>
                )}

                <button
                  onClick={handleBuzz}
                  disabled={isBuzzerLocked}
                  className={`w-full aspect-square rounded-full border-[10px] shadow-[0_15px_0_0_#991b1b] active:shadow-none active:translate-y-4 transition-all flex items-center justify-center group ${isBuzzerLocked
                    ? 'bg-slate-700 border-slate-800 shadow-none translate-y-2 cursor-not-allowed opacity-30 grayscale'
                    : 'bg-red-600 border-red-800 hover:bg-red-500'
                    } ${isShaking ? 'animate-shake' : ''}`}
                >
                  <span className={`font-game text-4xl group-active:scale-95 ${isBuzzerLocked ? 'text-slate-500' : 'text-white'}`}>
                    {isBuzzerLocked ? 'LOCKED' : 'BUZZ!'}
                  </span>
                </button>
              </div>
            ) : isMyTurn ? (
              <div className="text-center space-y-8 animate-bounce">
                <div className="bg-yellow-500 p-8 rounded-3xl text-black">
                  <p className="font-game text-4xl">GO!</p>
                  <p className="font-bold uppercase text-xs">Answer out loud</p>
                </div>
              </div>
            ) : (
              <div className="text-center bg-slate-800 p-12 rounded-3xl border-2 border-slate-700 opacity-50 grayscale">
                <p className="font-game text-xl text-slate-500 uppercase tracking-widest">Someone else buzzed</p>
              </div>
            )}
          </div>
        )}

        {gameState.status === 'REVEAL' && (
          <div className="text-center space-y-4">
            <p className="font-game text-2xl text-green-500">ANSWER REVEALED</p>
            <p className="text-slate-400 uppercase text-xs font-bold tracking-widest">Look at the big screen!</p>
          </div>
        )}
      </div>

      {/* Bottom Status */}
      <div className="w-full text-center pb-4">
        <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">REAL-TIME PEERJS ENABLED</p>
      </div>
    </div>
  );
};

export default PlayerView;
