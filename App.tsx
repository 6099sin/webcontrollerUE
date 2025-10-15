import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GameState } from './types';
import { LeftArrowIcon, RightArrowIcon } from './components/icons';
import type { Socket } from 'socket.io-client';

// This is a global from the script tag in index.html
declare const io: (uri: string) => Socket;

const SOCKET_SERVER_URL = 'https://ue-web-controller-536009461785.asia-southeast1.run.app';

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
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [queueTotal, setQueueTotal] = useState<number | null>(null);

  const handleMoveStart = (direction: 'left' | 'right') => {
    socket?.emit('move', { direction, action: 'start' });
  };

  const handleMoveEnd = (direction: 'left' | 'right') => {
    socket?.emit('move', { direction, action: 'stop' });
  };

  useEffect(() => {
    if (!socket) {
      // Clear UI if socket is gone
      setQueuePosition(null);
      setQueueTotal(null);
      return;
    }

    const onQueueUpdate = (data: { position: number; total: number }) => {
      setQueuePosition(data.position);
      setQueueTotal(data.total);
    };

    const onYourTurn = () => {
      // Active player; represent as position 0
      setQueuePosition(0);
      setQueueTotal(prev => prev ?? 0);
    };

    const onGameOver = () => {
      // Clear queue info when game ends
      setQueuePosition(null);
      setQueueTotal(null);
    };

    socket.on('queueUpdate', onQueueUpdate);
    socket.on('yourTurn', onYourTurn);
    socket.on('gameOver', onGameOver);

    return () => {
      socket.off('queueUpdate', onQueueUpdate);
      socket.off('yourTurn', onYourTurn);
      socket.off('gameOver', onGameOver);
    };
  }, [socket]);

  const isQueued = queuePosition === null || queuePosition > 0;

  return (
    <div className="relative flex flex-col h-full p-4"> {/* made relative to anchor overlay */}
      <header className="flex justify-between items-center mb-4">
        <div className="flex flex-col">
          <h2 className="text-2xl font-semibold text-cyan-400">{playerName}</h2>
          {queuePosition !== null && (
            queuePosition === 0 ? (
              <span className="text-sm text-green-300">Your turn</span>
            ) : (
              <span className="text-sm text-gray-400">Queue: {queuePosition}/{queueTotal}</span>
            )
          )}
        </div>
        <button
          onClick={onEndGame}
          className="px-4 py-2 text-sm font-bold text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
        >
          End Game
        </button>
      </header>

      <main className="flex-grow flex items-center justify-around gap-4">
        <button
          disabled={isQueued}
          onMouseDown={() => handleMoveStart('left')}
          onMouseUp={() => handleMoveEnd('left')}
          onTouchStart={() => handleMoveStart('left')}
          onTouchEnd={() => handleMoveEnd('left')}
          className="flex-1 h-full flex items-center justify-center bg-gray-800 border-2 border-gray-700 rounded-2xl active:bg-cyan-700 active:border-cyan-500 transition-all duration-100 select-none disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <LeftArrowIcon />
        </button>
        <button
          disabled={isQueued}
          onMouseDown={() => handleMoveStart('right')}
          onMouseUp={() => handleMoveEnd('right')}
          onTouchStart={() => handleMoveStart('right')}
          onTouchEnd={() => handleMoveEnd('right')}
          className="flex-1 h-full flex items-center justify-center bg-gray-800 border-2 border-gray-700 rounded-2xl active:bg-cyan-700 active:border-cyan-500 transition-all duration-100 select-none disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RightArrowIcon />
        </button>
      </main>

      {isQueued && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-60 z-20">
          <div className="bg-gray-800 bg-opacity-90 text-center px-6 py-4 rounded-lg border border-gray-700">
            {queuePosition === null ? (
              <JoiningDots />
            ) : (
              <div className="text-lg font-semibold text-white">Position: {queuePosition} of {queueTotal}</div>
            )}
            <div className="text-sm text-gray-400 mt-2">Waiting for your turn</div>
          </div>
        </div>
      )}
    </div>
  );
};

interface EndScreenProps {
  onPlayAgain: () => void;
}

const EndScreen: React.FC<EndScreenProps> = ({ onPlayAgain }) => {
  return (
    <div className="flex flex-col items-center justify-center h-full p-4 text-center">
      <h1 className="text-6xl font-bold mb-4 text-red-500">Out of time</h1>
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

// Insert animated "Joining" dots component
const JoiningDots: React.FC<{ baseText?: string; intervalMs?: number }> = ({ baseText = 'Joining', intervalMs = 500 }) => {
  const [dots, setDots] = useState('');
  useEffect(() => {
    const frames = ['', '.', '..', '...'];
    let idx = 0;
    const id = setInterval(() => {
      idx = (idx + 1) % frames.length;
      setDots(frames[idx]);
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return <div className="text-lg font-semibold text-white">{baseText}{dots}</div>;
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
