
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { GameState, Question, Player, SyncMessage } from '../types';
import { initHost, broadcastState, destroyPeer, generateRoomCode, sendToPeer, PEER_PREFIX } from '../services/gameSync';
import { generateJeopardyBoard } from '../services/geminiService';
import { loadMedicalBoard } from '../services/staticGameService';
import { audioService } from '../services/audioService';
import ParticleBackground from './ParticleBackground';

interface HostViewProps {
  roomCode: string;
  theme: string;
}

const HostView: React.FC<HostViewProps> = ({ roomCode, theme }) => {
  const [currentRoomCode, setCurrentRoomCode] = useState(roomCode);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(true);
  const [peerStatus, setPeerStatus] = useState<'CONNECTING' | 'CONNECTED' | 'ERROR'>('CONNECTING');
  const [error, setError] = useState<string | null>(null);
  const [introPlayerIndex, setIntroPlayerIndex] = useState(-1);
  const hostControllerPeerIdRef = useRef<string | null>(null);
  const gameStateRef = useRef<GameState | null>(null);

  // Sync ref with state so PeerJS callbacks can see the latest state
  useEffect(() => {
    gameStateRef.current = gameState;
    if (gameState) {
      broadcastState(gameState);
    }
  }, [gameState]);

  const updateAndBroadcast = useCallback((partial: Partial<GameState>) => {
    setGameState(prev => {
      if (!prev) return prev;
      return { ...prev, ...partial };
    });
  }, []);

  const handlePeerMessage = useCallback((msg: SyncMessage, senderPeerId: string) => {
    console.log('Host received message:', msg);
    const currentState = gameStateRef.current;
    if (!currentState) return;

    switch (msg.type) {
      case 'PLAYER_JOIN':
        const newPlayer: Player = msg.payload;
        // Don't add Host Controllers to the player list
        if (newPlayer.name === 'HOST_CONTROLLER') {
          if (hostControllerPeerIdRef.current && hostControllerPeerIdRef.current !== senderPeerId) {
            console.log('Rejecting additional host controller:', senderPeerId);
            sendToPeer(senderPeerId, {
              type: 'REJECTED',
              payload: 'Another host controller is already connected.',
              senderId: 'HOST'
            });
            return;
          }
          hostControllerPeerIdRef.current = senderPeerId;
          updateAndBroadcast({ isHostControllerConnected: true });
          return;
        }

        if (!currentState.players.find(p => p.id === newPlayer.id)) {
          updateAndBroadcast({
            players: [...currentState.players, newPlayer]
          });
        }
        break;
      case 'BUZZ':
        if (currentState.status === 'QUESTION_ACTIVE' && !currentState.activePlayerId) {
          // Check for individual buzzer lock first
          const player = currentState.players.find(p => p.id === msg.senderId);
          const now = Date.now();
          if (player?.buzzerLockUntil && now < player.buzzerLockUntil) {
            console.warn(`Buzz ignored for ${player.name} - individual lock active`);
            return;
          }

          // Then check global buzzer lock
          if (currentState.buzzerLockUntil && now < currentState.buzzerLockUntil) {
            console.warn('Buzz ignored - global buzzer is locked');
            return;
          }

          audioService.playBuzz();
          audioService.stopThinkMusic(); // Stop music on buzz
          updateAndBroadcast({
            activePlayerId: msg.senderId
          });
        }
        break;
      case 'BUZZ_LOCKED_ATTEMPT':
        // If player pressed buzzer while locked, reset their individual timer
        const updatedPlayersLock = currentState.players.map(p => {
          if (p.id === msg.senderId) {
            const lockDuration = 2000; // Fixed 2 second penalty
            return { ...p, buzzerLockUntil: Date.now() + lockDuration };
          }
          return p;
        });
        updateAndBroadcast({ players: updatedPlayersLock });
        break;
      case 'HOST_ACTION':
        // Handle remote host actions (Correct/Incorrect/Continue)
        if (msg.payload.action === 'CORRECT') {
          if (!currentState.activeQuestion || !currentState.activePlayerId) return;

          // Double points for Golden Question, 5x for Red
          let multiplier = 1;
          if (currentState.activeQuestion.isRed) multiplier = 5;
          else if (currentState.activeQuestion.isGolden) multiplier = 2;

          const points = currentState.activeQuestion.value * multiplier;

          const updatedPlayers = currentState.players.map(p =>
            p.id === currentState.activePlayerId
              ? { ...p, score: p.score + points, isBuzzed: false }
              : { ...p, isBuzzed: false }
          );

          const updatedCategories = currentState.categories.map(cat => ({
            ...cat,
            questions: cat.questions.map(q =>
              q.id === currentState.activeQuestion?.id ? { ...q, isAnswered: true } : q
            )
          }));

          updateAndBroadcast({
            status: 'REVEAL',
            players: updatedPlayers,
            categories: updatedCategories,
            activePlayerId: currentState.activePlayerId,
            revealTimer: 5
          });
          audioService.playCorrect();
        } else if (msg.payload.action === 'INCORRECT') {
          if (!currentState.activeQuestion || !currentState.activePlayerId) return;

          // Standard penalty, maybe double if golden? Usually strict Jeopardy rules say yes.
          // User asked for "double points", typically implies risk too. Let's do double penalty.
          let multiplier = 1;
          if (currentState.activeQuestion.isRed) multiplier = 5;
          else if (currentState.activeQuestion.isGolden) multiplier = 2;

          const points = currentState.activeQuestion.value * multiplier;

          const updatedPlayers = currentState.players.map(p =>
            p.id === currentState.activePlayerId
              ? { ...p, score: p.score - points, isBuzzed: false }
              : p
          );

          updateAndBroadcast({
            status: 'QUESTION_ACTIVE',
            players: updatedPlayers,
            activePlayerId: undefined,
            timer: 30,
            buzzerLockUntil: Date.now() + (1000 * 60 * 60)
          });
          audioService.playIncorrect();
          audioService.playThinkMusic();
        } else if (msg.payload.action === 'CONTINUE') {
          // Handle Continue Action from Host Phone
          // Need to call finishReveal logic.
          // We can replicate logic or move finishReveal to a reusable function that doesn't depend on closure if possible,
          // but here we can just execute the state update directly.

          // Check for game over
          const allAnswered = currentState.categories.every(cat => cat.questions.every(q => q.isAnswered));
          if (allAnswered) {
            updateAndBroadcast({
              status: 'FINISHED',
              activeQuestion: undefined,
              activePlayerId: undefined
            });
          } else {
            updateAndBroadcast({
              status: 'PLAYING',
              activeQuestion: undefined,
              activePlayerId: undefined
            });
          }
        } else if (msg.payload.action === 'SELECT_QUESTION') {
          const { questionId } = msg.payload;
          let targetQ: Question | undefined;
          currentState.categories.forEach(cat => {
            const q = cat.questions.find(q => q.id === questionId);
            if (q) targetQ = q;
          });

          // Check against currentState instead of component-level gameState which might be stale
          if (targetQ && !targetQ.isAnswered && currentState.status === 'PLAYING') {
            selectQuestion(targetQ);
          }
        } else if (msg.payload.action === 'RENAME_PLAYER') {
          const { playerId, newName } = msg.payload;
          const updatedPlayers = currentState.players.map(p =>
            p.id === playerId ? { ...p, name: newName } : p
          );
          updateAndBroadcast({ players: updatedPlayers });
        } else if (msg.payload.action === 'OVERRIDE_SCORE') {
          const { playerId, newScore } = msg.payload;
          const updatedPlayers = currentState.players.map(p =>
            p.id === playerId ? { ...p, score: newScore } : p
          );
          updateAndBroadcast({ players: updatedPlayers });
        } else if (msg.payload.action === 'KICK_PLAYER') {
          const playerToKickId = msg.payload.playerId;
          console.log('Kicking player:', playerToKickId);

          // 1. Send KICKED message to that peer
          sendToPeer(playerToKickId, {
            type: 'KICKED',
            payload: 'You have been kicked by the host.',
            senderId: 'HOST'
          });

          // 2. Remove from list
          updateAndBroadcast({
            players: currentState.players.filter(p => p.id !== playerToKickId)
          });
        } else if (msg.payload.action === 'START_GAME') {
          startGame();
        } else if (msg.payload.action === 'SKIP') {
          skipQuestion();
        } else if (msg.payload.action === 'RELEASE_BUZZER') {
          updateAndBroadcast({ buzzerLockUntil: 0 });
        }
        break;
    }
  }, [updateAndBroadcast]);

  const initGame = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let categories;
      if (theme === 'MEDICAL_SPECIAL') {
        categories = await loadMedicalBoard();
      } else {
        categories = await generateJeopardyBoard(theme);
      }

      // ASSIGN 3 RANDOM GOLDEN QUESTIONS
      let allQuestions: Question[] = [];
      categories.forEach(cat => allQuestions.push(...cat.questions));

      // Shuffle and pick 3 unique indices
      const indices = Array.from({ length: allQuestions.length }, (_, i) => i);
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }
      const goldenIndices = indices.slice(0, 3);

      // Map back to categories
      // We can iterate categories and questions and match IDs or just counting
      let qCount = 0;
      const categoriesWithGolden = categories.map(cat => ({
        ...cat,
        questions: cat.questions.map(q => {
          const isGolden = goldenIndices.includes(qCount);
          qCount++;
          return isGolden ? { ...q, isGolden: true } : q;
        })
      }));

      // ASSIGN 1 RANDOM RED QUESTION (Must not be Golden)
      let redIndex = -1;

      // Safety loop: try to find non-golden index
      let attempts = 0;
      // We need to know the total count again or track it. qCount holds the total count now.
      while (attempts < 100) {
        const r = Math.floor(Math.random() * qCount);
        if (!goldenIndices.includes(r)) {
          redIndex = r;
          break;
        }
        attempts++;
      }

      // Apply red status
      let qCountRed = 0;
      const categoriesWithRed = categoriesWithGolden.map(cat => ({
        ...cat,
        questions: cat.questions.map(q => {
          const isRed = qCountRed === redIndex;
          qCountRed++;
          return isRed ? { ...q, isRed: true } : q;
        })
      }));


      const newState: GameState = {
        roomCode,
        theme,
        status: 'LOBBY',
        players: [],
        categories: categoriesWithRed,
        timer: 30
      };

      // Initialize PeerJS as Host
      await initHost(roomCode, handlePeerMessage, (disconnectedPeerId) => {
        if (disconnectedPeerId === hostControllerPeerIdRef.current) {
          console.log('Host controller disconnected');
          hostControllerPeerIdRef.current = null;
          updateAndBroadcast({ isHostControllerConnected: false });
        }
      });

      setPeerStatus('CONNECTED');
      setGameState(newState);
    } catch (err: any) {
      console.error(err);
      setPeerStatus('ERROR');
      setError(err?.message || "Failed to initialize game. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [roomCode, theme, handlePeerMessage]);

  useEffect(() => {
    initGame();
    return () => {
      // Cleanup Peer when component unmounts
      destroyPeer();
    };
  }, [initGame]);

  // Timer Countdown Logic
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (gameState?.status === 'QUESTION_ACTIVE' && gameState.timer > 0 && !gameState.activePlayerId) {
      interval = setInterval(() => {
        setGameState(prev => {
          if (!prev) return null;
          const newTimer = prev.timer - 1;

          if (newTimer === 1) {
            audioService.stopThinkMusic();
          }

          return { ...prev, timer: newTimer };
        });
      }, 1000);
    } else if (gameState?.status === 'QUESTION_ACTIVE' && gameState.timer === 0 && !gameState.activePlayerId) {
      // Time's up
      audioService.playTimeout();
      skipQuestion();
    }

    return () => clearInterval(interval);
  }, [gameState?.status, gameState?.timer, gameState?.activePlayerId]);

  // Reveal Timer Logic
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (gameState?.status === 'REVEAL' && gameState.revealTimer && gameState.revealTimer > 0) {
      interval = setInterval(() => {
        setGameState(prev => {
          if (!prev || prev.status !== 'REVEAL' || !prev.revealTimer) return prev;
          const nextVal = prev.revealTimer - 1;
          if (nextVal === 0) {
            // We can't call finishReveal directly here easily due to state sync, 
            // so we'll let the next tick handle it or trigger it here.
            // But actually, we should just trigger the state change.
            return { ...prev, revealTimer: 0 };
          }
          return { ...prev, revealTimer: nextVal };
        });
      }, 1000);
    } else if (gameState?.status === 'REVEAL' && gameState.revealTimer === 0) {
      finishReveal();
    }
    return () => clearInterval(interval);
  }, [gameState?.status, gameState?.revealTimer]);

  const startGame = () => {
    if (gameState) {
      updateAndBroadcast({ status: 'INTRO' });
      setIntroPlayerIndex(0);
    }
  };

  // Intro Sequence Logic
  useEffect(() => {
    if (gameState?.status === 'INTRO' && introPlayerIndex >= 0) {
      if (introPlayerIndex < gameState.players.length) {
        audioService.playBuzz(); // Impact sound
        const timer = setTimeout(() => {
          setIntroPlayerIndex(prev => prev + 1);
        }, 2000); // 2 seconds per player
        return () => clearTimeout(timer);
      } else {
        // All players introduced
        const timer = setTimeout(() => {
          updateAndBroadcast({ status: 'PLAYING' });
          setIntroPlayerIndex(-1);
        }, 1000);
        return () => clearTimeout(timer);
      }
    }
  }, [gameState?.status, introPlayerIndex, gameState?.players.length]);

  const selectQuestion = (q: Question) => {
    // Robust check for state status - if called from handlePeerMessage, status check is already done on ref
    setGameState(prev => {
      if (!prev || prev.status !== 'PLAYING') return prev;

      const lockUntil = Date.now() + (1000 * 60 * 60); // Locked for 1 hour (effectively until manual release)

      // Start music 1.5s late as per request
      setTimeout(() => {
        // Only play if we are still in this question and nobody has buzzed
        setGameState(current => {
          if (current?.status === 'QUESTION_ACTIVE' && current.activeQuestion?.id === q.id && !current.activePlayerId) {
            audioService.playThinkMusic();
          }
          return current;
        });
      }, 1500);

      return {
        ...prev,
        status: 'QUESTION_ACTIVE',
        activeQuestion: q,
        timer: 30,
        buzzerLockUntil: lockUntil
      };
    });
  };

  const handleCorrect = () => {
    // Debounce/Prevent double press
    if (!gameState || !gameState.activeQuestion || !gameState.activePlayerId || gameState.status !== 'QUESTION_ACTIVE') return;

    let multiplier = 1;
    if (gameState.activeQuestion.isRed) multiplier = 5;
    else if (gameState.activeQuestion.isGolden) multiplier = 2;

    const points = gameState.activeQuestion.value * multiplier;

    const updatedPlayers = gameState.players.map(p =>
      p.id === gameState.activePlayerId
        ? { ...p, score: p.score + points, isBuzzed: false }
        : { ...p, isBuzzed: false }
    );

    const updatedCategories = gameState.categories.map(cat => ({
      ...cat,
      questions: cat.questions.map(q =>
        q.id === gameState.activeQuestion?.id ? { ...q, isAnswered: true } : q
      )
    }));

    updateAndBroadcast({
      status: 'REVEAL',
      players: updatedPlayers,
      categories: updatedCategories,
      activePlayerId: gameState.activePlayerId,
      revealTimer: 5
    });
    audioService.playCorrect();
    audioService.stopThinkMusic();
  };

  const handleIncorrect = () => {
    if (!gameState || !gameState.activeQuestion || !gameState.activePlayerId) return;

    let multiplier = 1;
    if (gameState.activeQuestion.isRed) multiplier = 5;
    else if (gameState.activeQuestion.isGolden) multiplier = 2;

    const points = gameState.activeQuestion.value * multiplier;

    const updatedPlayers = gameState.players.map(p =>
      p.id === gameState.activePlayerId
        ? { ...p, score: p.score - points, isBuzzed: false }
        : p
    );

    updateAndBroadcast({
      status: 'QUESTION_ACTIVE',
      players: updatedPlayers,
      activePlayerId: undefined,
      timer: 30,
      buzzerLockUntil: Date.now() + (1000 * 60 * 60)
    });
    audioService.playIncorrect();

    // Start music 1.5s late
    setTimeout(() => {
      setGameState(current => {
        if (current?.status === 'QUESTION_ACTIVE' && !current.activePlayerId) {
          audioService.playThinkMusic();
        }
        return current;
      });
    }, 1500);
  };

  const skipQuestion = () => {
    if (!gameState || !gameState.activeQuestion) return;
    const updatedCategories = gameState.categories.map(cat => ({
      ...cat,
      questions: cat.questions.map(q =>
        q.id === gameState.activeQuestion?.id ? { ...q, isAnswered: true } : q
      )
    }));

    updateAndBroadcast({
      status: 'REVEAL',
      categories: updatedCategories,
      activePlayerId: undefined
    });
    audioService.playTimeout();
    audioService.stopThinkMusic();
  }

  const finishReveal = () => {
    audioService.stopThinkMusic();
    // Check if game is over
    if (gameState) {
      const allAnswered = gameState.categories.every(cat => cat.questions.every(q => q.isAnswered));
      if (allAnswered) {
        updateAndBroadcast({
          status: 'FINISHED',
          activeQuestion: undefined,
          activePlayerId: undefined
        });
        return;
      }
    }

    updateAndBroadcast({
      status: 'PLAYING',
      activeQuestion: undefined,
      activePlayerId: undefined
    });
    // audioService.playTheme(); // Removed
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950">
        <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="font-game text-xl text-blue-400">
          {theme === 'MEDICAL_SPECIAL' ? 'LOADING MEDICAL ARCHIVES...' : 'HARI IS CRAFTING THE BOARD...'}
        </p>
        <p className="text-slate-500 text-sm mt-2">{theme === 'MEDICAL_SPECIAL' ? 'Standard MBBS Edition' : `Theme: ${theme}`}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-center p-6">
        <p className="text-red-500 font-bold text-2xl mb-4">Launch Error / Abort</p>
        <p className="text-slate-400 mb-8">{error}</p>
        <button onClick={() => window.location.reload()} className="bg-slate-800 text-white px-6 py-3 rounded-xl border border-slate-700 hover:bg-slate-700">
          Mission Abort (Refresh)
        </button>
      </div>
    );
  }

  if (!gameState) return null;

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6 flex flex-col relative overflow-hidden">
      <div className="absolute inset-0 z-0">
        <ParticleBackground />
      </div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6 z-10 relative">
        <div className="flex items-start gap-4">
          <div>
            <h2 className="font-game text-4xl neon-text text-blue-500 tracking-tighter">HARI JEOPARDY</h2>
            <p className="text-slate-400 text-sm uppercase font-bold tracking-widest">{gameState.theme}</p>
          </div>
          <div className="flex flex-col gap-1 mt-2">
            <div className="flex items-center gap-2 bg-slate-900/50 backdrop-blur px-3 py-1 rounded-full border border-slate-700">
              <div className={`w-2 h-2 rounded-full ${peerStatus === 'CONNECTED' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]' : peerStatus === 'CONNECTING' ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'}`} />
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                {peerStatus === 'CONNECTED' ? 'Live' : peerStatus === 'CONNECTING' ? 'Connecting...' : 'Offline'}
              </span>
            </div>
            {peerStatus === 'CONNECTED' && (
              <span className="text-[8px] text-slate-600 font-mono ml-2 uppercase">ID: {PEER_PREFIX}{currentRoomCode}</span>
            )}
          </div>
        </div>
        <div className="flex gap-4 items-center">
          {gameState.isHostControllerConnected && (
            <button
              onClick={() => {
                hostControllerPeerIdRef.current = null;
                updateAndBroadcast({ isHostControllerConnected: false });
              }}
              className="bg-red-900/20 hover:bg-red-900/40 border border-red-500/50 text-red-500 px-3 py-2 rounded-xl text-[10px] font-bold uppercase transition-all active:scale-95"
              title="Force clear the host controller slot"
            >
              Reset Controller
            </button>
          )}
          <div className="bg-slate-900 border-2 border-slate-700 px-6 py-4 rounded-2xl text-center">
            <p className="text-xs text-slate-400 font-bold uppercase mb-1">Room Code</p>
            <p className="font-game text-4xl tracking-widest text-white">{currentRoomCode}</p>
          </div>
        </div>
      </div>

      {/* Main Board / Interaction Area */}
      <div className="flex-grow flex gap-6 overflow-hidden z-10 relative">

        {/* Left Side: Scoreboard */}
        <div className="w-64 space-y-4">
          <h3 className="font-game text-slate-500 text-sm">PLAYERS</h3>
          {gameState.players.map((p) => (
            <div key={p.id} className={`p-4 rounded-xl border-2 transition-all group relative ${p.id === gameState.activePlayerId ? 'bg-yellow-500/20 border-yellow-500 neon-border' : 'bg-slate-900 border-slate-800'}`}>
              <div className="flex justify-between items-start">
                <div className="flex-grow min-w-0">
                  <p className="font-bold truncate group-hover:hidden">{p.name}</p>
                  <div className="hidden group-hover:flex flex-col gap-1">
                    <input
                      type="text"
                      defaultValue={p.name}
                      onBlur={(e) => {
                        if (e.target.value !== p.name) {
                          const updatedPlayers = gameState.players.map(pl =>
                            pl.id === p.id ? { ...pl, name: e.target.value } : pl
                          );
                          updateAndBroadcast({ players: updatedPlayers });
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      }}
                      className="bg-slate-800 border border-slate-600 rounded px-2 py-0.5 text-xs w-full font-bold focus:outline-none focus:border-blue-500"
                    />
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-slate-500 font-bold">₹</span>
                      <input
                        type="number"
                        defaultValue={p.score}
                        onBlur={(e) => {
                          const val = parseInt(e.target.value);
                          if (!isNaN(val) && val !== p.score) {
                            const updatedPlayers = gameState.players.map(pl =>
                              pl.id === p.id ? { ...pl, score: val } : pl
                            );
                            updateAndBroadcast({ players: updatedPlayers });
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        }}
                        className="bg-slate-800 border border-slate-600 rounded px-2 py-0.5 text-xs w-full font-bold focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                  <p className="font-game text-2xl text-blue-400 group-hover:hidden">₹{p.score}</p>
                </div>
                {p.id === gameState.activePlayerId && (
                  <div className={`mt-2 text-[10px] font-bold uppercase animate-pulse ${gameState.status === 'REVEAL' ? 'text-green-500' : 'text-yellow-500'}`}>
                    {gameState.status === 'REVEAL' ? 'CORRECT!' : 'BUZZED IN!'}
                  </div>
                )}
              </div>
            </div>
          ))}
          {gameState.players.length === 0 && <p className="text-slate-600 text-sm italic">Waiting for players to join...</p>}
        </div>

        {/* Center: The Board or Active Question */}
        <div className="flex-grow bg-slate-900/50 rounded-3xl border-2 border-slate-800 p-6 flex items-center justify-center relative overflow-hidden">

          {gameState.status === 'INTRO' && introPlayerIndex < gameState.players.length && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-xl">
              <div className="text-center space-y-8 animate-impact">
                <div className="inline-block px-12 py-4 bg-blue-600 rounded-full border-4 border-blue-400 shadow-[0_0_50px_rgba(37,99,235,0.5)] flare-container">
                  <div className="flare-overlay" />
                  <p className="text-sm font-game text-blue-200 uppercase tracking-widest">Contender Revealed</p>
                </div>
                <div className="space-y-2">
                  <h1 className="text-9xl font-game neon-text text-white animate-vibrate">
                    {gameState.players[introPlayerIndex]?.name}
                  </h1>
                </div>
                <div className="flex justify-center gap-4">
                  <div className="h-2 w-32 bg-blue-500 rounded-full animate-pulse" />
                  <div className="h-2 w-32 bg-blue-500 rounded-full animate-pulse delay-75" />
                  <div className="h-2 w-32 bg-blue-500 rounded-full animate-pulse delay-150" />
                </div>
              </div>
            </div>
          )}

          {gameState.status === 'LOBBY' && (
            <div className="text-center space-y-8 w-full max-w-4xl">
              <div className="space-y-4">
                <h1 className="text-6xl font-game neon-text">READY TO START?</h1>
                <p className="text-slate-400 text-xl">Join using the room code: <b className="text-white tracking-widest bg-slate-800 px-4 py-1 rounded-lg">{currentRoomCode}</b></p>
              </div>

              <div className="grid grid-cols-3 gap-6 w-full py-8">
                {gameState.players.map((p) => (
                  <div key={p.id} className="bg-slate-900/80 border-2 border-blue-500/30 p-6 rounded-2xl animate-float" style={{ animationDelay: `${Math.random() * 2}s` }}>
                    <div className="w-16 h-16 bg-blue-600 rounded-full mx-auto mb-4 flex items-center justify-center shadow-lg border-2 border-blue-400">
                      <span className="text-2xl font-game">{p.name.charAt(0).toUpperCase()}</span>
                    </div>
                    <p className="font-game text-xl truncate">{p.name}</p>
                    <p className="text-blue-400 text-xs font-bold uppercase tracking-widest mt-1">Ready</p>
                  </div>
                ))}
                {gameState.players.length === 0 && (
                  <div className="col-span-3 py-12">
                    <p className="text-slate-500 font-game animate-pulse text-2xl">Waiting for participants to join...</p>
                  </div>
                )}
              </div>

              <button
                onClick={startGame}
                disabled={gameState.players.length === 0}
                className={`px-12 py-6 font-game text-2xl rounded-2xl shadow-xl transition-all ${gameState.players.length > 0 ? 'bg-blue-600 hover:bg-blue-500 cursor-pointer hover:scale-105 active:scale-95' : 'bg-slate-800 text-slate-600 cursor-not-allowed opacity-50'}`}
              >
                {gameState.players.length === 0 ? 'WAITING FOR PLAYERS' : 'START GAME'}
              </button>
            </div>
          )}

          {gameState.status === 'PLAYING' && (
            <div className="grid grid-cols-5 gap-4 w-full h-full">
              {gameState.categories.map((cat, cIdx) => (
                <div key={cIdx} className="flex flex-col gap-4">
                  <div className="h-20 bg-blue-900/40 border-2 border-blue-800 rounded-xl flex items-center justify-center p-2 text-center shadow-lg">
                    <span className="font-game text-sm text-blue-200 uppercase leading-tight">{cat.title}</span>
                  </div>
                  {cat.questions.map((q) => (
                    <button
                      key={q.id}
                      onClick={() => !q.isAnswered && selectQuestion(q)}
                      disabled={q.isAnswered}
                      className={`flex-grow border-2 rounded-xl transition-all transform flex items-center justify-center ${q.isAnswered
                        ? 'bg-slate-900/20 border-slate-900 text-transparent'
                        : 'bg-blue-600 border-blue-500 hover:scale-105 hover:bg-blue-500 hover:border-blue-400 shadow-lg text-white font-game text-3xl'
                        }`}
                    >
                      {!q.isAnswered && `₹${q.value}`}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}

          {gameState.status === 'QUESTION_ACTIVE' && gameState.activeQuestion && (
            <div className={`text-center space-y-12 max-w-4xl p-8 rounded-3xl transition-all duration-700 animate-in zoom-in slide-in-from-top-12 ease-out ${gameState.activeQuestion.isRed
              ? 'shadow-[0_0_100px_rgba(220,38,38,0.5)] border-4 border-red-500 bg-red-950/50'
              : gameState.activeQuestion.isGolden
                ? 'shadow-[0_0_100px_rgba(234,179,8,0.3)] border-4 border-yellow-500/50 bg-yellow-900/20'
                : ''
              }`}>
              <div className="space-y-2">
                <div className="flex items-center justify-center gap-4">
                  <p className={`${gameState.activeQuestion.isRed ? 'text-red-400' :
                    gameState.activeQuestion.isGolden ? 'text-yellow-400' : 'text-blue-500'
                    } font-game text-xl uppercase tracking-widest`}>
                    {gameState.activeQuestion.category} - ₹{gameState.activeQuestion.value}
                  </p>
                  {gameState.activeQuestion.isGolden && !gameState.activeQuestion.isRed && (
                    <span className="font-game text-yellow-400 text-xs border border-yellow-400 px-2 py-1 rounded animate-pulse">GOLDEN QUESTION x2</span>
                  )}
                  {gameState.activeQuestion.isRed && (
                    <span className="font-game text-red-500 text-xs border border-red-500 px-2 py-1 rounded animate-pulse font-black bg-red-900/50">⚠️ RED QUESTION x4</span>
                  )}
                </div>
                <h2 className={`text-5xl font-black leading-tight ${gameState.activeQuestion.isRed ? 'text-red-100' :
                  gameState.activeQuestion.isGolden ? 'text-yellow-100' : 'text-white'
                  }`}>{gameState.activeQuestion.question}</h2>
              </div>

              {!gameState.activePlayerId ? (
                <div className="flex flex-col items-center gap-4">
                  <div className={`text-6xl font-game animate-pulse ${gameState.activeQuestion.isRed ? 'text-red-500' :
                    gameState.activeQuestion.isGolden ? 'text-yellow-400' : 'text-yellow-500'
                    }`}>{gameState.timer}</div>
                  <div className="text-slate-500 font-game text-xl">WAITING FOR BUZZ...</div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="p-8 bg-yellow-500 text-black rounded-3xl shadow-2xl inline-block transform -rotate-1">
                    <p className="text-sm font-bold uppercase tracking-widest opacity-70">Answering Now</p>
                    <p className="text-4xl font-game">{gameState.players.find(p => p.id === gameState.activePlayerId)?.name}</p>
                  </div>
                  <div className="flex gap-4 justify-center mt-8">
                    <button onClick={handleCorrect} className="bg-green-600 hover:bg-green-500 px-8 py-4 rounded-xl font-game text-xl shadow-lg transform transition active:scale-95">CORRECT</button>
                    <button onClick={handleIncorrect} className="bg-red-600 hover:bg-red-500 px-8 py-4 rounded-xl font-game text-xl shadow-lg transform transition active:scale-95">INCORRECT</button>
                  </div>
                </div>
              )}

              <button onClick={skipQuestion} className="absolute bottom-4 right-4 bg-slate-800 hover:bg-slate-700 text-slate-300 px-6 py-3 rounded-lg text-sm uppercase font-bold tracking-widest border border-slate-600 shadow-lg">
                Time's Up / No Answer
              </button>
            </div>
          )}

          {gameState.status === 'REVEAL' && gameState.activeQuestion && (
            <div className="text-center space-y-12 max-w-4xl p-8 animate-in fade-in zoom-in duration-300">
              <div className="space-y-4">
                <p className="text-slate-500 font-game text-xl uppercase tracking-widest">The Answer Was:</p>
                <h2 className="text-6xl font-black text-blue-400 leading-tight underline decoration-blue-500/30 underline-offset-8">{gameState.activeQuestion.answer}</h2>
              </div>

              {gameState.revealTimer !== undefined && (
                <div className="flex flex-col items-center gap-2">
                  <div className="text-5xl font-game text-blue-500/50">{gameState.revealTimer}</div>
                  <p className="text-[10px] font-bold text-slate-700 uppercase tracking-widest">Returning to board...</p>
                </div>
              )}

              <div className="pt-8">
                <button
                  onClick={finishReveal}
                  className="bg-blue-600 hover:bg-blue-500 px-12 py-6 rounded-2xl font-game text-2xl shadow-xl transform transition hover:scale-105 active:scale-95"
                >
                  CONTINUE
                </button>
              </div>
            </div>
          )}

          {gameState.status === 'FINISHED' && (
            <div className="text-center space-y-12 animate-in fade-in zoom-in duration-700 w-full h-full flex flex-col items-center justify-center">
              <h1 className="text-6xl font-game text-yellow-500 neon-text mb-12">CHAMPIONS PODIUM</h1>

              <div className="flex justify-center items-end gap-8 h-96 w-full">
                {/* 2nd Place */}
                {[...gameState.players].sort((a, b) => b.score - a.score)[1] && (
                  <div className="flex flex-col items-center animate-bounce-short">
                    <div className="w-40 h-64 bg-slate-400 border-4 border-slate-300 rounded-t-xl flex flex-col justify-end pb-4 shadow-2xl relative">
                      <div className="absolute -top-12 text-6xl">🥈</div>
                      <p className="font-game text-2xl text-slate-900">{[...gameState.players].sort((a, b) => b.score - a.score)[1].score}</p>
                    </div>
                    <div className="mt-4 text-2xl font-bold bg-slate-800 px-6 py-2 rounded-xl">
                      {[...gameState.players].sort((a, b) => b.score - a.score)[1].name}
                    </div>
                  </div>
                )}

                {/* 1st Place */}
                {[...gameState.players].sort((a, b) => b.score - a.score)[0] && (
                  <div className="flex flex-col items-center z-10 animate-bounce-large">
                    <div className="w-48 h-80 bg-yellow-500 border-4 border-yellow-300 rounded-t-xl flex flex-col justify-end pb-4 shadow-2xl relative shadow-yellow-500/50">
                      <div className="absolute -top-16 text-8xl">👑</div>
                      <p className="font-game text-4xl text-yellow-900 font-extrabold">{[...gameState.players].sort((a, b) => b.score - a.score)[0].score}</p>
                    </div>
                    <div className="mt-4 text-3xl font-bold bg-slate-800 px-8 py-3 rounded-xl border-2 border-yellow-500 text-yellow-500">
                      {[...gameState.players].sort((a, b) => b.score - a.score)[0].name}
                    </div>
                  </div>
                )}

                {/* 3rd Place */}
                {[...gameState.players].sort((a, b) => b.score - a.score)[2] && (
                  <div className="flex flex-col items-center animate-bounce-short">
                    <div className="w-40 h-48 bg-orange-700 border-4 border-orange-600 rounded-t-xl flex flex-col justify-end pb-4 shadow-2xl relative">
                      <div className="absolute -top-12 text-6xl">🥉</div>
                      <p className="font-game text-2xl text-orange-200">{[...gameState.players].sort((a, b) => b.score - a.score)[2].score}</p>
                    </div>
                    <div className="mt-4 text-2xl font-bold bg-slate-800 px-6 py-2 rounded-xl">
                      {[...gameState.players].sort((a, b) => b.score - a.score)[2].name}
                    </div>
                  </div>
                )}
              </div>

              <button onClick={() => window.location.reload()} className="mt-12 bg-blue-600 hover:bg-blue-500 px-8 py-4 rounded-xl font-game">START NEW GAME</button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default HostView;
