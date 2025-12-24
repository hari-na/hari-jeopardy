
import React, { useState } from 'react';
import { GameRole } from '../types';
import { generateRoomCode } from '../services/gameSync';
import ParticleBackground from './ParticleBackground';

interface LobbyProps {
  onStartHost: (roomCode: string, theme: string) => void;
  onJoinPlayer: (roomCode: string, name: string) => void;
}

const Lobby: React.FC<LobbyProps> = ({ onStartHost, onJoinPlayer }) => {
  const [mode, setMode] = useState<'INITIAL' | 'HOST' | 'JOIN'>('INITIAL');
  const [roomCode, setRoomCode] = useState('');
  const [name, setName] = useState('');
  const [theme, setTheme] = useState('General Knowledge');
  const [error, setError] = useState('');

  const handleHostSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!theme) return;
    const code = generateRoomCode();
    onStartHost(code, theme);
  };

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomCode || !name) return;
    onJoinPlayer(roomCode.toUpperCase(), name);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-slate-900 overflow-hidden relative">
      {/* Background elements */}
      <ParticleBackground />
      <div className="absolute top-10 left-10 w-32 h-32 bg-blue-600 rounded-full blur-[80px] opacity-20"></div>
      <div className="absolute bottom-10 right-10 w-48 h-48 bg-purple-600 rounded-full blur-[100px] opacity-20"></div>

      <div className="z-10 text-center space-y-8 max-w-md w-full">
        <h1 className="text-6xl font-game neon-text italic tracking-tighter text-blue-400 animate-float">
          HARI<br /><span className="text-purple-400">JEOPARDY</span>
        </h1>

        {mode === 'INITIAL' && (
          <div className="flex flex-col gap-4 mt-12">
            <button
              onClick={() => setMode('HOST')}
              className="group relative px-8 py-6 bg-blue-600 hover:bg-blue-500 rounded-2xl transition-all transform hover:scale-105 active:scale-95 shadow-xl"
            >
              <span className="font-game text-2xl">CREATE GAME</span>
              <p className="text-xs opacity-70">Be the Big Screen Host</p>
            </button>
            <button
              onClick={() => setMode('JOIN')}
              className="group relative px-8 py-6 bg-slate-800 hover:bg-slate-700 rounded-2xl transition-all transform hover:scale-105 active:scale-95 border-2 border-slate-700"
            >
              <span className="font-game text-2xl">JOIN GAME</span>
              <p className="text-xs opacity-70">Play on your Phone</p>
            </button>
          </div>
        )}

        {mode === 'HOST' && (
          <form onSubmit={handleHostSubmit} className="bg-slate-800 p-8 rounded-3xl space-y-6 shadow-2xl border border-slate-700">
            <div className="text-left space-y-2">
              <label className="text-sm font-bold text-slate-400 uppercase tracking-widest">Game Theme</label>
              <input
                autoFocus
                type="text"
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                placeholder="e.g. 90s Pop Culture"
                className="w-full bg-slate-900 border-2 border-slate-700 rounded-xl px-4 py-3 focus:border-blue-500 outline-none text-xl transition-all"
              />
            </div>
            <button type="submit" className="w-full bg-blue-600 font-game py-4 rounded-xl text-xl hover:bg-blue-500 shadow-lg">
              GENERATE BOARD (AI)
            </button>

            <div className="relative flex py-2 items-center">
              <div className="flex-grow border-t border-slate-700"></div>
              <span className="flex-shrink mx-4 text-slate-500 text-xs uppercase tracking-widest">OR</span>
              <div className="flex-grow border-t border-slate-700"></div>
            </div>

            <button
              type="button"
              onClick={() => onStartHost(generateRoomCode(), 'MEDICAL_SPECIAL')}
              className="w-full bg-green-600 font-game py-4 rounded-xl text-xl hover:bg-green-500 shadow-lg"
            >
              START MEDICAL QUIZ (MBBS)
            </button>

            <button type="button" onClick={() => setMode('INITIAL')} className="text-slate-500 text-sm hover:text-slate-400">
              Go Back
            </button>
          </form>
        )}

        {mode === 'JOIN' && (
          <form onSubmit={handleJoinSubmit} className="bg-slate-800 p-8 rounded-3xl space-y-6 shadow-2xl border border-slate-700">
            <div className="text-left space-y-2">
              <label className="text-sm font-bold text-slate-400 uppercase tracking-widest">Room Code</label>
              <input
                autoFocus
                maxLength={4}
                type="text"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="ABCD"
                className="w-full bg-slate-900 border-2 border-slate-700 rounded-xl px-4 py-3 focus:border-purple-500 outline-none text-4xl text-center font-game tracking-widest transition-all"
              />
            </div>
            <div className="text-left space-y-2">
              <label className="text-sm font-bold text-slate-400 uppercase tracking-widest">Your Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="The Master"
                className="w-full bg-slate-900 border-2 border-slate-700 rounded-xl px-4 py-3 focus:border-purple-500 outline-none text-xl transition-all"
              />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <div className="flex justify-between items-center">
              <button type="submit" className="w-1/2 bg-purple-600 font-game py-4 rounded-xl text-xl hover:bg-purple-500 shadow-lg">
                ENTER ROOM
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!roomCode) {
                    setError('Enter room code first!');
                    return;
                  }
                  onJoinPlayer(roomCode.toUpperCase(), 'HOST_CONTROLLER');
                }}
                className="text-slate-400 hover:text-blue-400 text-xs font-bold uppercase tracking-widest p-4 underline"
              >
                Join as Host
              </button>
            </div>
            <button type="button" onClick={() => setMode('INITIAL')} className="text-slate-500 text-sm hover:text-slate-400">
              Go Back
            </button>
          </form>
        )}
      </div>

      <div className="mt-12 text-slate-500 text-xs text-center uppercase tracking-widest opacity-40">
        Best played with multiple browser tabs or devices
      </div>
    </div>
  );
};

export default Lobby;
