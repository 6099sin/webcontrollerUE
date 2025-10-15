
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GameState } from './types';
import { LeftArrowIcon, RightArrowIcon } from './components/icons';
import type { Socket } from 'socket.io-client';

// This is a global from the script tag in index.html
declare const io: (uri: string) => Socket;

const SOCKET_SERVER_URL = 'http://localhost:3001';

// --- Helper Components (defined outside App to prevent re-rendering issues) ---

interface SetupScreenProps {
  onJoin: (name: string) => void;
}

const SetupScreen: React.FC<SetupScreenProps> = ({ onJoin }) => {
  const [name, setName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onJoin(name.trim());
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full p-4">
      <h1 className="text-5xl font-bold mb-8 text-cyan-400">Unreal Controller</h1>
      <form onSubmit={handleSubmit} className="w-full max-w-sm">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter Your Player Name"
          className="w-full px-4 py-3 mb-4 text-lg text-white bg-gray-800 border-2 border-gray-700 rounded-lg focus:outline-none focus:border-cyan-500 transition-colors"
          autoFocus
        />
        <button
          type="submit"
          disabled={!name.trim()}
          className="w-full px-4 py-3 text-lg font-bold text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
        >
          Join Game
        </button>
      </form>
    </div>
  );
};

interface ControllerScreenProps {
  socket: Socket | null;
  playerName: string;
  onEndGame: () => void;
}

const ControllerScreen: React.FC<ControllerScreenProps> = ({ socket, playerName, onEndGame }) => {
  const handleMoveStart = (direction: 'left' | 'right') => {
    socket?.emit('move', { direction, action: 'start' });
  };

  const handleMoveEnd = (direction: 'left' | 'right') => {
    socket?.emit('move', { direction, action: 'stop' });
  };

  return (
    <div className="flex flex-col h-full p-4">
      <header className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-semibold text-cyan-400">{playerName}</h2>
        <button
          onClick={onEndGame}
          className="px-4 py-2 text-sm font-bold text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
        >
          End Game
        </button>
      </header>
      <main className="flex-grow flex items-center justify-around gap-4">
        <button
          onMouseDown={() => handleMoveStart('left')}
          onMouseUp={() => handleMoveEnd('left')}
          onTouchStart={() => handleMoveStart('left')}
          onTouchEnd={() => handleMoveEnd('left')}
          className="flex-1 h-full flex items-center justify-center bg-gray-800 border-2 border-gray-700 rounded-2xl active:bg-cyan-700 active:border-cyan-500 transition-all duration-100 select-none"
        >
          <LeftArrowIcon />
        </button>
        <button
          onMouseDown={() => handleMoveStart('right')}
          onMouseUp={() => handleMoveEnd('right')}
          onTouchStart={() => handleMoveStart('right')}
          onTouchEnd={() => handleMoveEnd('right')}
          className="flex-1 h-full flex items-center justify-center bg-gray-800 border-2 border-gray-700 rounded-2xl active:bg-cyan-700 active:border-cyan-500 transition-all duration-100 select-none"
        >
          <RightArrowIcon />
        </button>
      </main>
    </div>
  );
};

interface EndScreenProps {
  onPlayAgain: () => void;
}

const EndScreen: React.FC<EndScreenProps> = ({ onPlayAgain }) => {
  return (
    <div className="flex flex-col items-center justify-center h-full p-4 text-center">
      <h1 className="text-6xl font-bold mb-4 text-red-500">Game Over</h1>
      <p className="text-xl text-gray-400 mb-8">Thanks for playing!</p>
      <button
        onClick={onPlayAgain}
        className="px-8 py-4 text-xl font-bold text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 transition-colors"
      >
        Play Again
      </button>
    </div>
  );
};

// --- Main App Component ---

function App() {
  const [gameState, setGameState] = useState<GameState>(GameState.SETUP);
  const [playerName, setPlayerName] = useState<string>('');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const socket = useRef<Socket | null>(null);

  useEffect(() => {
    // Connect to Socket.IO server
    socket.current = io(SOCKET_SERVER_URL);

    socket.current.on('connect', () => {
      console.log('Connected to server!');
      setIsConnected(true);
      socket.current?.emit('register', { client_type: 'web_controller' });
    });

    socket.current.on('disconnect', () => {
      console.log('Disconnected from server');
      setIsConnected(false);
      setGameState(GameState.ENDGAME); // Force end game on disconnect
    });

    // Listen for server-initiated game over
    socket.current.on('gameOver', () => {
        console.log('Game over signal received from server.');
        setGameState(GameState.ENDGAME);
    });

    // Cleanup on component unmount
    return () => {
      if (socket.current) {
        socket.current.disconnect();
      }
    };
  }, []);

  const handleJoin = useCallback((name: string) => {
    setPlayerName(name);
    setGameState(GameState.CONTROLLER);
    socket.current?.emit('joinGame', { playerName: name });
  }, []);

  const handleEndGame = useCallback(() => {
    setGameState(GameState.ENDGAME);
    socket.current?.emit('endGame', { playerName });
  }, [playerName]);

  const handlePlayAgain = useCallback(() => {
    setPlayerName('');
    setGameState(GameState.SETUP);
  }, []);

  const renderContent = () => {
    switch (gameState) {
      case GameState.SETUP:
        return <SetupScreen onJoin={handleJoin} />;
      case GameState.CONTROLLER:
        return <ControllerScreen socket={socket.current} playerName={playerName} onEndGame={handleEndGame} />;
      case GameState.ENDGAME:
        return <EndScreen onPlayAgain={handlePlayAgain} />;
      default:
        return <SetupScreen onJoin={handleJoin} />;
    }
  };

  return (
    <div className="h-screen w-screen bg-gray-900 text-white overflow-hidden select-none">
       <div className="absolute top-2 right-2 flex items-center space-x-2">
            <span className="text-xs text-gray-500">
                {isConnected ? 'Connected' : 'Disconnected'}
            </span>
            <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
        </div>
      {renderContent()}
    </div>
  );
}

export default App;
