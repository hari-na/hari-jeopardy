
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { GameState, SyncMessage } from '../types';
import { initPlayer, sendAction } from '../services/gameSync';

interface HostControllerViewProps {
  roomCode: string;
}

const HostControllerView: React.FC<HostControllerViewProps> = ({ roomCode }) => {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const gameStateRef = useRef<GameState | null>(null);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  const [connecting, setConnecting] = useState(true);
  const [attempt, setAttempt] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const handleMessage = useCallback((msg: SyncMessage) => {
    if (msg.type === 'UPDATE_STATE') {
      const state = msg.payload as GameState;
      const currentGameState = gameStateRef.current;

      if (state.isHostControllerConnected && !currentGameState) {
        // This might happen if we joined but someone else is already host
        // However, the REJECTED message is more reliable for immediate feedback
      }
      setGameState(state);
    } else if (msg.type === 'REJECTED') {
      setError(msg.payload || 'Another host controller is already connected to this room.');
    }
  }, []);

  useEffect(() => {
    const setup = async () => {
      try {
        setConnecting(true);
        setError(null);
        await initPlayer(roomCode, 'HOST_CONTROLLER', handleMessage, (a) => setAttempt(a));
      } catch (err: any) {
        console.error(err);
        const type = err?.type || 'unknown';
        setError(`Failed to connect as Host Controller (${type}).`);
      } finally {
        setConnecting(false);
      }
    };

    setup();
  }, [roomCode, handleMessage]);

  if (connecting) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="font-game text-xl text-blue-400">Connecting as Host...</p>
        <p className="text-slate-500 text-xs mt-2 uppercase tracking-widest font-bold">Attempt {attempt} of 3</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-blue-900/10 border-2 border-blue-500/50 p-8 rounded-3xl max-w-sm">
          <p className="text-blue-400 font-bold mb-4 uppercase tracking-widest">Host Connection Error</p>
          <p className="text-sm text-slate-400 mb-8">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="w-full bg-slate-800 hover:bg-slate-700 px-6 py-4 rounded-xl border border-slate-700 font-bold transition-all active:scale-95"
          >
            RETRY CONNECTION
          </button>
        </div>
      </div>
    );
  }

  if (!gameState) return <div className="p-8 text-center text-slate-500 font-game">Waiting for game data...</div>;

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col p-6">
      <div className="flex justify-between items-center mb-8 border-b border-slate-800 pb-4">
        <div>
          <h1 className="font-game text-xl text-blue-500">HOST CONTROLLER</h1>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Room: {roomCode}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-500 font-bold uppercase">Status</p>
          <p className="font-game text-sm text-purple-400">{gameState.status}</p>
        </div>
      </div>

      <div className="flex-grow space-y-6">
        {gameState.status === 'LOBBY' && (
          <div className="bg-slate-900 p-6 rounded-2xl border-2 border-slate-800 text-center">
            <p className="text-slate-400 mb-2 uppercase text-xs font-bold">Players Joined</p>
            <p className="text-4xl font-game mb-4">{gameState.players.filter(p => p.name !== 'HOST_CONTROLLER').length}</p>
            <div className="space-y-3">
              {gameState.players.filter(p => p.name !== 'HOST_CONTROLLER').map(p => (
                <div key={p.id} className="flex gap-2 items-center bg-slate-800 p-2 rounded-xl border border-slate-700">
                  <input
                    type="text"
                    defaultValue={p.name}
                    className="flex-grow bg-slate-950 border border-slate-700 rounded px-3 py-1 text-sm font-bold focus:outline-none focus:border-blue-500"
                    onBlur={(e) => {
                      if (e.target.value !== p.name) {
                        sendAction('HOST_ACTION', { action: 'RENAME_PLAYER', playerId: p.id, newName: e.target.value });
                      }
                    }}
                  />
                  <div className="flex items-center gap-1 bg-slate-950 border border-slate-700 rounded px-2">
                    <span className="text-[10px] text-slate-500 font-bold">₹</span>
                    <input
                      type="number"
                      defaultValue={p.score}
                      className="w-16 bg-transparent text-sm font-bold focus:outline-none"
                      onBlur={(e) => {
                        const val = parseInt(e.target.value);
                        if (!isNaN(val) && val !== p.score) {
                          sendAction('HOST_ACTION', { action: 'OVERRIDE_SCORE', playerId: p.id, newScore: val });
                        }
                      }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">{p.id.slice(0, 4)}</span>
                  <button
                    onClick={() => {
                      if (confirm(`Kick ${p.name}?`)) {
                        sendAction('HOST_ACTION', { action: 'KICK_PLAYER', playerId: p.id });
                      }
                    }}
                    className="ml-2 bg-red-900/20 hover:bg-red-900/40 border border-red-500/50 text-red-500 px-2 py-1 rounded text-[10px] font-bold uppercase transition-all"
                  >
                    KICK
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={() => sendAction('HOST_ACTION', { action: 'START_GAME' })}
              disabled={gameState.players.filter(p => p.name !== 'HOST_CONTROLLER').length === 0}
              className={`w-full mt-6 py-4 rounded-xl font-game text-xl shadow-lg transition-all ${gameState.players.filter(p => p.name !== 'HOST_CONTROLLER').length > 0 ? 'bg-blue-600 active:scale-95' : 'bg-slate-800 text-slate-700 cursor-not-allowed'
                }`}
            >
              START GAME
            </button>
          </div>
        )}

        {(gameState.status === 'QUESTION_ACTIVE' || gameState.status === 'REVEAL') && gameState.activeQuestion && (
          <div className="space-y-6">
            <div className="bg-blue-900/20 p-6 rounded-2xl border-2 border-blue-500/50 relative">
              <button
                onClick={() => sendAction('HOST_ACTION', { action: 'SKIP' })}
                className="absolute top-4 right-4 bg-slate-800 text-slate-400 px-3 py-1 rounded-lg text-[10px] font-bold uppercase border border-slate-700 active:bg-slate-700"
              >
                Skip Question
              </button>
              <p className="text-blue-500 text-[10px] font-bold uppercase tracking-widest mb-2">{gameState.activeQuestion.category} - ₹{gameState.activeQuestion.value}</p>
              <h2 className="text-xl font-bold leading-tight mb-4">{gameState.activeQuestion.question}</h2>
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Answer Key</p>
                <p className="text-2xl font-game text-green-400">{gameState.activeQuestion.answer}</p>
              </div>
            </div>

            {gameState.activePlayerId && (
              <div className="bg-yellow-500/10 p-6 rounded-2xl border-2 border-yellow-500/50 animate-pulse">
                <p className="text-yellow-500 text-[10px] font-bold uppercase mb-1">Currently Answering</p>
                <p className="text-2xl font-game mb-4">
                  {gameState.players.find(p => p.id === gameState.activePlayerId)?.name}
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => sendAction('HOST_ACTION', { action: 'CORRECT', playerId: gameState.activePlayerId })}
                    className="bg-green-600 active:bg-green-700 py-4 rounded-xl font-bold border border-green-500 shadow-lg text-lg"
                  >
                    CORRECT
                  </button>
                  <button
                    onClick={() => sendAction('HOST_ACTION', { action: 'INCORRECT', playerId: gameState.activePlayerId })}
                    className="bg-red-600 active:bg-red-700 py-4 rounded-xl font-bold border border-red-500 shadow-lg text-lg"
                  >
                    INCORRECT
                  </button>
                </div>
              </div>
            )}

            {gameState.status === 'QUESTION_ACTIVE' && !gameState.activePlayerId && (
              <div className="bg-blue-600/10 p-6 rounded-2xl border-2 border-blue-500/50">
                <p className="text-blue-500 text-[10px] font-bold uppercase mb-1">Buzzer Control</p>
                {gameState.buzzerLockUntil && gameState.buzzerLockUntil > Date.now() ? (
                  <button
                    onClick={() => sendAction('HOST_ACTION', { action: 'RELEASE_BUZZER' })}
                    className="w-full bg-blue-600 active:bg-blue-700 py-6 rounded-2xl font-game text-2xl shadow-xl flex items-center justify-center gap-4"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    RELEASE BUZZER
                  </button>
                ) : (
                  <div className="w-full bg-green-600/20 py-6 rounded-2xl font-game text-xl text-green-500 border border-green-500/50 flex items-center justify-center gap-4 opacity-50">
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      <path d="M12 15v.01" />
                    </svg>
                    BUZZER RELEASED
                  </div>
                )}
              </div>
            )}

            {gameState.status === 'REVEAL' && (
              <button
                onClick={() => sendAction('HOST_ACTION', { action: 'CONTINUE' })}
                className="w-full bg-blue-600 hover:bg-blue-500 py-6 rounded-2xl font-game text-xl shadow-xl mt-4 animate-pulse"
              >
                CONTINUE
              </button>
            )}
          </div>
        )}

        {gameState.status === 'PLAYING' && (
          <div className="space-y-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Select Question</p>
            <div className="grid grid-cols-5 gap-2">
              {gameState.categories.map((cat, cIdx) => (
                <div key={cIdx} className="flex flex-col gap-2">
                  <div className="h-8 bg-blue-900/20 border border-blue-800/50 rounded flex items-center justify-center p-1 overflow-hidden">
                    <span className="text-[6px] text-blue-300 uppercase font-bold text-center leading-none truncate">{cat.title}</span>
                  </div>
                  {cat.questions.map((q) => (
                    <button
                      key={q.id}
                      onClick={() => !q.isAnswered && sendAction('HOST_ACTION', { action: 'SELECT_QUESTION', questionId: q.id })}
                      disabled={q.isAnswered}
                      className={`h-10 border rounded transition-all text-[10px] font-bold cursor-pointer active:scale-95 touch-manipulation ${q.isAnswered
                        ? 'bg-slate-900/50 border-slate-900 text-slate-800 cursor-not-allowed opacity-30 grayscale'
                        : q.isRed ? 'bg-red-600 border-red-400 text-white hover:bg-red-500 hover:border-red-300'
                          : q.isGolden ? 'bg-yellow-600 border-yellow-400 text-white hover:bg-yellow-500 hover:border-yellow-300'
                            : 'bg-blue-600 border-blue-500 text-white hover:bg-blue-500 hover:border-blue-400'
                        }`}
                    >
                      {!q.isAnswered ? `₹${q.value}` : 'X'}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-auto pt-6 text-center">
        <p className="text-[10px] font-bold text-slate-700 uppercase tracking-widest italic">Host View: Answers Revealed</p>
      </div>
    </div >
  );
};

export default HostControllerView;
