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
  isMyTurn: boolean;
  queueInfo: { position: number; total: number } | null;
}

const ControllerScreen: React.FC<ControllerScreenProps> = ({ socket, playerName, onEndGame, isMyTurn, queueInfo }) => {
  const [animatePosition, setAnimatePosition] = useState(false);
  const prevPositionRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (queueInfo && prevPositionRef.current !== undefined) {
      if (queueInfo.position < prevPositionRef.current) {
        setAnimatePosition(true);
        const timer = setTimeout(() => {
          setAnimatePosition(false);
        }, 500); // Animation duration
        return () => clearTimeout(timer);
      }
    }
    prevPositionRef.current = queueInfo?.position;
  }, [queueInfo]);
  
  const handleMoveStart = (direction: 'left' | 'right') => {
    if (!isMyTurn) return;
    socket?.emit('move', { direction, action: 'start' });
  };

  const handleMoveEnd = (direction: 'left' | 'right') => {
    if (!isMyTurn) return;
    socket?.emit('move', { direction, action: 'stop' });
  };

  const buttonBaseClasses = "flex-1 h-full flex items-center justify-center border-2 rounded-2xl transition-all duration-100 select-none";
  const activeButtonClasses = "bg-gray-800 border-gray-700 hover:bg-gray-700 active:bg-cyan-600 active:border-cyan-400 active:scale-95 active:ring-4 active:ring-cyan-500/50";
  const inactiveButtonClasses = "bg-gray-800 border-gray-700 opacity-30 cursor-not-allowed";

  return (
    <div className="flex flex-col h-full p-4">
      <header className="flex justify-between items-center mb-4 min-h-[40px]">
        <h2 className="text-2xl font-semibold text-cyan-400">{playerName}</h2>
        {isMyTurn && (
          <button
            onClick={onEndGame}
            className="px-4 py-2 text-sm font-bold text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
          >
            End Game
          </button>
        )}
      </header>
      <main className="flex-grow flex items-center justify-around gap-4 relative">
        {!isMyTurn && (
          <div className="absolute inset-0 bg-gray-900 bg-opacity-80 flex flex-col items-center justify-center z-10 rounded-2xl p-4 text-center">
            {queueInfo ? (
              <>
                <h3 className="text-4xl font-bold mb-2 text-cyan-400">In Queue</h3>
                <p className="text-2xl">
                  Position: <span className={`font-bold text-white inline-block ${animatePosition ? 'animate-position-update' : ''}`}>{queueInfo.position}</span> of {queueInfo.total}
                </p>
              </>
            ) : (
              <h3 className="text-4xl font-bold text-cyan-400 animate-pulse">Joining...</h3>
            )}
          </div>
        )}
        <button
          disabled={!isMyTurn}
          onMouseDown={() => handleMoveStart('left')}
          onMouseUp={() => handleMoveEnd('left')}
          onTouchStart={() => handleMoveStart('left')}
          onTouchEnd={() => handleMoveEnd('left')}
          className={`${buttonBaseClasses} ${isMyTurn ? activeButtonClasses : inactiveButtonClasses}`}
          aria-disabled={!isMyTurn}
        >
          <LeftArrowIcon />
        </button>
        <button
          disabled={!isMyTurn}
          onMouseDown={() => handleMoveStart('right')}
          onMouseUp={() => handleMoveEnd('right')}
          onTouchStart={() => handleMoveStart('right')}
          onTouchEnd={() => handleMoveEnd('right')}
          className={`${buttonBaseClasses} ${isMyTurn ? activeButtonClasses : inactiveButtonClasses}`}
          aria-disabled={!isMyTurn}
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
  const [isMyTurn, setIsMyTurn] = useState<boolean>(false);
  const [queueInfo, setQueueInfo] = useState<{ position: number; total: number } | null>(null);
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

    // Listen for queue updates
    socket.current.on('queueUpdate', (data: { position: number; total: number }) => {
      console.log('Queue update received:', data);
      setQueueInfo(data);
      setIsMyTurn(false);
    });

    // Listen for turn start
    socket.current.on('yourTurn', () => {
      console.log("It's my turn!");
      setIsMyTurn(true);
      setQueueInfo(null);
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
    setIsMyTurn(false);
    setQueueInfo(null);
    setGameState(GameState.CONTROLLER);
    socket.current?.emit('joinGame', { playerName: name });
  }, []);

  const handleEndGame = useCallback(() => {
    setGameState(GameState.ENDGAME);
    socket.current?.emit('endGame', { playerName });
    setIsMyTurn(false);
    setQueueInfo(null);
  }, [playerName]);

  const handlePlayAgain = useCallback(() => {
    setPlayerName('');
    setIsMyTurn(false);
    setQueueInfo(null);
    setGameState(GameState.SETUP);
  }, []);

  const renderContent = () => {
    switch (gameState) {
      case GameState.SETUP:
        return <SetupScreen onJoin={handleJoin} />;
      case GameState.CONTROLLER:
        return <ControllerScreen 
          socket={socket.current} 
          playerName={playerName} 
          onEndGame={handleEndGame}
          isMyTurn={isMyTurn}
          queueInfo={queueInfo}
        />;
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