
export enum GameRole {
  HOST = 'HOST',
  PLAYER = 'PLAYER',
  HOST_CONTROLLER = 'HOST_CONTROLLER',
  NONE = 'NONE'
}

export interface Question {
  id: string;
  value: number;
  question: string;
  answer: string;
  isAnswered: boolean;
  category: string;
  isGolden?: boolean;
  isRed?: boolean;
}

export interface Category {
  title: string;
  questions: Question[];
}

export interface Player {
  id: string;
  name: string;
  score: number;
  isBuzzed: boolean;
  buzzTime?: number;
  buzzerLockUntil?: number;
}

export interface GameState {
  roomCode: string;
  status: 'LOBBY' | 'INTRO' | 'PLAYING' | 'QUESTION_ACTIVE' | 'BUZZED' | 'REVEAL' | 'FINISHED';
  activeQuestion?: Question;
  activePlayerId?: string;
  players: Player[];
  categories: Category[];
  theme: string;
  timer: number;
  buzzerLockUntil?: number;
  revealTimer?: number;
  isHostControllerConnected?: boolean;
}

export interface SyncMessage {
  type: 'UPDATE_STATE' | 'PLAYER_JOIN' | 'BUZZ' | 'SUBMIT_ANSWER' | 'NEXT_TURN' | 'HOST_ACTION' | 'BUZZ_LOCKED_ATTEMPT' | 'RELEASE_BUZZER' | 'REJECTED' | 'KICKED';
  payload: any;
  senderId: string;
}
