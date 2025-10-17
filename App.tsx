import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GameState } from './types';
import { LeftArrowIcon, RightArrowIcon } from './components/icons';
import type { Socket } from 'socket.io-client';

// This is a global from the script tag in index.html
declare const io: (uri: string) => Socket;

//const SOCKET_SERVER_URL = 'https://ue-web-controller-536009461785.asia-southeast1.run.app';
const SOCKET_SERVER_URL = 'http://localhost:3001';

// const SOCKET_SERVER_URL = 'https://ue-web-controller-536009461785.asia-southeast1.run.app';

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
      <h1 className="text-5xl font-bold mb-8 text-pink-400">Web Controller</h1>
      <form onSubmit={handleSubmit} className="w-full max-w-sm">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter Your Player Name"
          className="w-full px-4 py-3 mb-4 text-lg text-white bg-gray-800 border-2 border-gray-700 rounded-lg focus:outline-none focus:border-pink-500 transition-colors"
          autoFocus
        />
        <button
          type="submit"
          disabled={!name.trim()}
          className="w-full px-4 py-3 text-lg font-bold text-white bg-pink-600 rounded-lg hover:bg-pink-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
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
}

const ControllerScreen: React.FC<ControllerScreenProps> = ({ socket, playerName }) => {
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [queueTotal, setQueueTotal] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [remainingTime, setRemainingTime] = useState(0);
  const [prepareTime, setPrepareTime] = useState<number | null>(null);

  const handleMoveStart = (direction: 'left' | 'right') => {
    socket?.emit('move', { direction, action: 'start' });
  };

  const handleMoveEnd = (direction: 'left' | 'right') => {
    socket?.emit('move', { direction, action: 'stop' });
  };

  useEffect(() => {
    if (prepareTime && prepareTime > 0) {
        const timer = setTimeout(() => {
            setPrepareTime(prepareTime - 1000);
        }, 1000);
        return () => clearTimeout(timer);
    }
}, [prepareTime]);

  useEffect(() => {
    if (!socket) {
      // Clear UI if socket is gone
      setQueuePosition(null);
      setQueueTotal(null);
      setScore(0);
      setRemainingTime(0);
      return;
    }

    const onQueueUpdate = (data: { position: number; total: number }) => {
      setQueuePosition(data.position);
      setQueueTotal(data.total);
    };

    const onPrepareToPlay = (data: { duration: number }) => {
      setQueuePosition(null); // Hide queue overlay
      setPrepareTime(data.duration);
    };

    const onYourTurn = () => {
      setPrepareTime(null);
      setQueuePosition(0);
      setQueueTotal(prev => prev ?? 0);
      setScore(0);
      setRemainingTime(30000);
    };

    const onGameOver = () => {
      // Clear queue info when game ends
      setQueuePosition(null);
      setQueueTotal(null);
    };

    const onScoreUpdate = (data: { score: number }) => {
      setScore(data.score);
    };

    const onTimeUpdate = (data: { remaining: number }) => {
      setRemainingTime(data.remaining);
    };

    socket.on('queueUpdate', onQueueUpdate);
    socket.on('prepareToPlay', onPrepareToPlay);
    socket.on('yourTurn', onYourTurn);
    socket.on('gameOver', onGameOver);
    socket.on('scoreUpdate', onScoreUpdate);
    socket.on('timeUpdate', onTimeUpdate);

    return () => {
      socket.off('queueUpdate', onQueueUpdate);
      socket.off('prepareToPlay', onPrepareToPlay);
      socket.off('yourTurn', onYourTurn);
      socket.off('gameOver', onGameOver);
      socket.off('scoreUpdate', onScoreUpdate);
      socket.off('timeUpdate', onTimeUpdate);
    };
  }, [socket]);

  const isQueued = queuePosition === null || queuePosition > 0;

  return (
    <div className="relative flex flex-col h-full p-4"> {/* made relative to anchor overlay */}
      <header className="flex justify-between items-center mb-4">
        <div className="flex flex-col">
          <h2 className="text-2xl font-semibold text-pink-400">{playerName}</h2>
          {queuePosition !== null && (
            queuePosition === 0 ? (
              <span className="text-sm text-teal-300">Your turn</span>
            ) : (
              <span className="text-sm text-gray-400">{queuePosition - 1} queues left</span>
            )
          )}
        </div>
        {queuePosition === 0 && (
          <div className="flex items-center gap-4">
            <div className="text-2xl font-bold text-white">
                Score: {score}
            </div>
            <div className="text-lg font-bold text-yellow-400">
                Time: {Math.ceil(remainingTime / 1000)}s
            </div>
          </div>
        )}
      </header>

      <main className="flex-grow flex items-center justify-around gap-4">
        <button
          disabled={isQueued}
          onMouseDown={() => handleMoveStart('left')}
          onMouseUp={() => handleMoveEnd('left')}
          onTouchStart={() => handleMoveStart('left')}
          onTouchEnd={() => handleMoveEnd('left')}
          className="flex-1 h-full flex items-center justify-center bg-gray-800 border-2 border-gray-700 rounded-2xl active:bg-pink-700 active:border-pink-500 transition-all duration-100 select-none disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <LeftArrowIcon />
        </button>
        <button
          disabled={isQueued}
          onMouseDown={() => handleMoveStart('right')}
          onMouseUp={() => handleMoveEnd('right')}
          onTouchStart={() => handleMoveStart('right')}
          onTouchEnd={() => handleMoveEnd('right')}
          className="flex-1 h-full flex items-center justify-center bg-gray-800 border-2 border-gray-700 rounded-2xl active:bg-pink-700 active:border-pink-500 transition-all duration-100 select-none disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RightArrowIcon />
        </button>
      </main>

      {isQueued && prepareTime === null && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-60 z-20">
          <div className="bg-gray-800 bg-opacity-90 text-center px-6 py-4 rounded-lg border border-gray-700">
            {queuePosition === null ? (
              <JoiningDots />
            ) : (
              <div className="text-lg font-semibold text-white">{queuePosition - 1} queues left</div>
            )}
            <div className="text-sm text-gray-400 mt-2">Waiting for your turn</div>
          </div>
        </div>
      )}

      {prepareTime !== null && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-70 z-30">
          <div className="text-center">
            <p className="text-2xl text-gray-300 mb-2">Get Ready!</p>
            <p className="text-8xl font-bold text-white">{Math.ceil(prepareTime / 1000)}</p>
          </div>
        </div>
      )}
    </div>
  );
};

interface EndScreenProps {
  finalScore: number;
}

const EndScreen: React.FC<EndScreenProps> = ({ finalScore }) => {
  return (
    <div className="flex flex-col items-center justify-center h-full p-4 text-center">
      <h1 className="text-6xl font-bold mb-4 text-purple-500">Out of time</h1>
      <p className="text-2xl text-white mb-4">Your score: {finalScore}</p>
      <p className="text-xl text-gray-400 mb-8">Thanks for playing!</p>
    </div>
  );
};

const WaitingScreen: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center h-full p-4 text-center">
      <h1 className="text-4xl font-bold mb-4 text-yellow-400">Game in Progress</h1>
      <p className="text-lg text-gray-300 mb-8">Please wait for the current round to finish.</p>
      <JoiningDots baseText="Waiting" />
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
  const [gameState, setGameState] = useState<GameState>(GameState.WAITING_QUEUE);
  const [playerName, setPlayerName] = useState<string>('');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const socket = useRef<Socket | null>(null);
  const [finalScore, setFinalScore] = useState(0);

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

    socket.current.on('connectionStatus', ({ isGameActive }: { isGameActive: boolean }) => {
      if (isGameActive) {
        setGameState(GameState.WAITING_QUEUE);
      } else {
        setGameState(GameState.SETUP);
      }
    });

    socket.current.on('gameAvailable', () => {
      // If we are in the waiting queue or endgame screen, switch to setup
      if (gameState === GameState.WAITING_QUEUE || gameState === GameState.ENDGAME) {
        setGameState(GameState.SETUP);
      }
    });

    // Listen for server-initiated game over
    socket.current.on('gameOver', (data: { finalScore: number }) => {
        console.log(`Game over signal received from server. Final score: ${data.finalScore}`);
        setFinalScore(data.finalScore);
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

  const renderContent = () => {
    switch (gameState) {
      case GameState.SETUP:
        return <SetupScreen onJoin={handleJoin} />;
      case GameState.WAITING_QUEUE:
        return <WaitingScreen />;
      case GameState.CONTROLLER:
        return <ControllerScreen socket={socket.current} playerName={playerName} />;
      case GameState.ENDGAME:
        return <EndScreen finalScore={finalScore} />;
      default:
        return <WaitingScreen />;
    }
  };

  return (
    <div className="h-screen w-screen bg-gray-900 text-white overflow-hidden select-none">
       <div className="absolute top-2 right-2 flex items-center space-x-2">
            <span className="text-xs text-gray-500">
                {isConnected ? 'Connected' : 'Disconnected'}
            </span>
            <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-teal-500' : 'bg-purple-500'}`}></div>
        </div>
      {renderContent()}
    </div>
  );
}

export default App;