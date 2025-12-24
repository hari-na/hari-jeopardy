
import React, { useState } from 'react';
import Lobby from './components/Lobby';
import HostView from './components/HostView';
import PlayerView from './components/PlayerView';
import HostControllerView from './components/HostControllerView';
import { GameRole } from './types';

const App: React.FC = () => {
  const [role, setRole] = useState<GameRole>(GameRole.NONE);
  const [roomCode, setRoomCode] = useState('');
  const [theme, setTheme] = useState('');
  const [playerId, setPlayerId] = useState('');
  const [playerName, setPlayerName] = useState('');

  const handleStartHost = (code: string, selectedTheme: string) => {
    setRoomCode(code);
    setTheme(selectedTheme);
    setRole(GameRole.HOST);
  };

  const handleJoinPlayer = (code: string, name: string) => {
    setRoomCode(code);
    if (name === 'HOST_CONTROLLER') {
      setRole(GameRole.HOST_CONTROLLER);
    } else {
      setPlayerName(name);
      setRole(GameRole.PLAYER);
    }
  };

  if (role === GameRole.HOST) {
    return <HostView roomCode={roomCode} theme={theme} />;
  }

  if (role === GameRole.HOST_CONTROLLER) {
    return <HostControllerView roomCode={roomCode} />;
  }

  if (role === GameRole.PLAYER) {
    return <PlayerView roomCode={roomCode} playerName={playerName} />;
  }

  return <Lobby onStartHost={handleStartHost} onJoinPlayer={handleJoinPlayer} />;
};

export default App;
