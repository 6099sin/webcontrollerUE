import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GameState } from './types';
import { LeftArrowIcon, RightArrowIcon } from './components/icons';
import type { Socket } from 'socket.io-client';
import './src/styles/background.css';

// This is a global from the script tag in index.html
declare const io: (uri: string) => Socket;

const SOCKET_SERVER_URL = 'https://ue-web-controller-712649324249.asia-southeast1.run.app';
// const SOCKET_SERVER_URL = 'http://localhost:3001';



// --- Helper Components (defined outside App to prevent re-rendering issues) ---

interface SetupScreenProps {
  onJoin: (name: string) => void;
}

// =================================================================
// START OF NEW/UPDATED SetupScreen COMPONENT
// =================================================================
const SetupScreen: React.FC<SetupScreenProps> = ({ onJoin }) => {
  const [name, setName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onJoin(name.trim());
    }
  };

  return (
    // Use flex-col, center horizontally, start from the top with padding
    <div className="flex flex-col items-center justify-start h-full p-8 pt-20 overflow-y-auto">

      {/* 1. Header Text */}
      <div className="text-center text-black mb-8">
        <h1 className="text-6xl font-['Central_Sang_Bleu'] tracking-wide">CENTRAL</h1>
        <p className="text-2xl font-['Central_Sang_Bleu'] tracking-normal my-1">78TH ANNIVERSARY</p>
        <h2 className="text-5xl font-['Central_Sang_Bleu'] tracking-wide">FLOWER SHOW</h2>
      </div>

      {/* 2. Instruction Box */}
      {/* Using the pink color from the image: #F49C9B */}
      <div className="bg-[#F49C9B] bg-opacity-95 text-black p-5 rounded-2xl mb-8 w-full max-w-xs shadow-md">
        <h3 className="text-2xl font-['CPN'] font-bold text-center mb-2">วิธีการเล่นเกม</h3>
        <p className="text-base font-['CPN'] text-center">
          ขยับซ้าย-ขวา รับดอกไม้ และโบนัสไอเท็มx2 ให้ได้มากที่สุดใน 30 วินาที
        </p>
        
        {/* --- Placeholder Icons --- 
            NOTE: You will need to replace these placeholders with your actual icon images.
            I will use emoji and styled text as placeholders.
        */}
        <div className="flex justify-around items-center mt-4">
          <span className="text-3xl">🌸</span>
          <span className="text-3xl">🌺</span>
          <span className="text-3xl">🌼</span>
          {/* Placeholder for the x2 icon */}
          <span className="text-2xl font-bold bg-white px-2 py-1 rounded-md shadow-sm">x2</span>
        </div>
      </div>

      {/* 3. Form */}
      <form onSubmit={handleSubmit} className="w-full max-w-xs">
        <label className="text-black font-['CPN'] font-bold mb-2 block text-center text-lg">
          กรุณาใส่ชื่อผู้เล่น
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-5 py-3 mb-4 text-lg text-black bg-white rounded-full shadow-inner border border-gray-300 focus:outline-none focus:ring-2 focus:ring-rose-400"
          autoFocus
        />
        <button
          type="submit"
          disabled={!name.trim()}
          className="w-full px-4 py-4 text-3xl font-['Central_Sang_Bleu'] font-bold text-white bg-[#F49C9B] rounded-full shadow-lg hover:bg-opacity-80 active:bg-opacity-100 transition-all disabled:bg-gray-400"
        >
          START
        </button>
      </form>
    </div>
  );
};
// =================================================================
// END OF NEW/UPDATED SetupScreen COMPONENT
// =================================================================


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
      setRemainingTime(30000); // Game duration
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

  // Check if player is waiting (in queue or preparing)
  const isQueued = queuePosition === null || queuePosition > 0;
  const isPlaying = queuePosition === 0 && prepareTime === null; // Player is actively playing

  return (
    // Added padding top to make space for absolute positioned elements
    <div className="relative flex flex-col h-full p-4 pt-12"> 

      {/* --- Added Player Name (Top Left) --- */}
      {/* Only show when actively playing */}
      {isPlaying && (
        <div className="absolute top-4 left-4 text-left">
          <h2 className="text-xl font-['CPN'] font-bold text-white drop-shadow">{playerName}</h2>
          <span className="text-sm text-teal-300 drop-shadow">Your turn</span>
        </div>
      )}

      {/* --- Added Score and Time (Top Right) --- */}
      {/* Only show when actively playing */}
      {isPlaying && (
        <div className="absolute top-4 right-4 text-right">
          <div className="text-xl font-bold text-white font-['CPN_Condensed'] drop-shadow">
              Score: {score}
          </div>
          <div className="text-lg font-bold text-yellow-400 font-['CPN_Condensed'] drop-shadow">
              Time: {Math.ceil(remainingTime / 1000)}s
          </div>
        </div>
      )}

      {/* Header Text (slightly smaller top padding) */}
      <div className="text-center text-white pt-8 mb-8 opacity-90"> {/* Reduced pt */}
        <h1 className="text-6xl font-['Central_Sang_Bleu'] tracking-wide">CENTRAL</h1>
        <p className="text-2xl font-['Central_Sang_Bleu'] tracking-normal my-1">78TH ANNIVERSARY</p>
        <h2 className="text-5xl font-['Central_Sang_Bleu'] tracking-wide">FLOWER SHOW</h2>
      </div>

      {/* Main Controller Buttons (Unchanged) */}
      <main className="flex-grow flex items-center justify-around gap-4 px-4">
        <button
          disabled={isQueued || prepareTime !== null} // Also disable during prepare countdown
          onMouseDown={() => handleMoveStart('left')}
          onMouseUp={() => handleMoveEnd('left')}
          onTouchStart={() => handleMoveStart('left')}
          onTouchEnd={() => handleMoveEnd('left')}
          className="flex-1 h-full flex items-center justify-center text-[#F49C9B] opacity-80 active:opacity-100 transition-all duration-100 select-none disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-24 h-24" fill="currentColor" viewBox="0 0 24 24">
            <path d="M19 5v14L5 12z" />
          </svg>
        </button>
        <button
          disabled={isQueued || prepareTime !== null} // Also disable during prepare countdown
          onMouseDown={() => handleMoveStart('right')}
          onMouseUp={() => handleMoveEnd('right')}
          onTouchStart={() => handleMoveStart('right')}
          onTouchEnd={() => handleMoveEnd('right')}
          className="flex-1 h-full flex items-center justify-center text-[#F49C9B] opacity-80 active:opacity-100 transition-all duration-100 select-none disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-24 h-24" fill="currentColor" viewBox="0 0 24 24">
            <path d="M5 5v14l14-7z" />
          </svg>
        </button>
      </main>

      {/* Overlays for Queue and Prepare (Unchanged) */}
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
  playerName: string;
}

const EndScreen: React.FC<EndScreenProps> = ({ finalScore, playerName }) => {
  return (
    <div className="flex flex-col items-center justify-start h-full p-8 pt-20 text-center overflow-y-auto">
      
      {/* 1. Title */}
      <div className="text-center text-white mb-4">
        <h1 className="text-5xl font-['CPN'] font-bold tracking-wider text-pink-400 drop-shadow-md">YOUR SCORE</h1>
        <p className="text-2xl font-['CPN'] mt-1 text-pink-300 drop-shadow-sm">{playerName}</p>
      </div>

      {/* 2. Score Display (Flower Shape) */}
      {/* We'll approximate the shape using CSS and SVG */}
      <div className="relative w-64 h-64 flex items-center justify-center my-8">
        {/* Background Flower Shape SVG */}
        <svg viewBox="0 0 200 200" className="absolute w-full h-full drop-shadow-lg">
          {/* Use a gradient for the pink/orange effect */}
          <defs>
            <radialGradient id="flowerGradient" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
              <stop offset="0%" style={{ stopColor: '#FFD1A0', stopOpacity: 1 }} /> 
              <stop offset="60%" style={{ stopColor: '#FF8A8A', stopOpacity: 1 }} /> 
              <stop offset="100%" style={{ stopColor: '#F49C9B', stopOpacity: 0.9 }} /> 
            </radialGradient>
          </defs>
          {/* Approximate flower shape path */}
          <path 
            fill="url(#flowerGradient)" 
            d="M100,5 C140,5 160,30 175,50 C195,75 195,125 175,150 C160,170 140,195 100,195 C60,195 40,170 25,150 C5,125 5,75 25,50 C40,30 60,5 100,5 Z M100,20 C70,20 55,40 45,60 C30,85 30,115 45,140 C55,160 70,180 100,180 C130,180 145,160 155,140 C170,115 170,85 155,60 C145,40 130,20 100,20 Z" 
            transform="rotate(45 100 100)" // Rotate to make it look less like a square
          />
        </svg>
        {/* Score Text */}
        <span className="relative text-7xl font-['CPN_Condensed'] font-bold text-white drop-shadow-lg z-10">
          {finalScore.toString().padStart(4, '0')} {/* Pad score with leading zeros */}
        </span>
      </div>

      {/* 3. The 1 Point Section */}
      <div className="bg-black bg-opacity-80 text-white p-4 rounded-2xl w-full max-w-sm mt-8 shadow-xl flex items-center justify-between relative overflow-hidden">
         {/* Red corner accent */}
         <div className="absolute top-0 right-0 h-12 w-12 border-t-4 border-r-4 border-red-500 rounded-tr-2xl"></div>

         <div className="flex items-baseline">
            <span className="text-5xl font-['Central_Sang_Bleu'] font-light mr-1">The</span>
            <span className="text-8xl font-['Central_Sang_Bleu'] font-light leading-none border-r-4 border-red-500 pr-3 mr-3">1</span>
         </div>
         <div className="text-right">
            <p className="text-sm font-['CPN'] text-gray-300">คุณได้แต้ม</p>
            <p className="text-6xl font-['CPN_Condensed'] font-bold text-white leading-none">780</p> {/* Placeholder Value */}
            <p className="text-lg font-['CPN_Condensed'] font-bold text-white">Point</p>
         </div>
      </div>

    </div>
  );
};

const WaitingScreen: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-start h-full p-4 pt-20 text-center relative">
      {/* "Please wait a moment" text in a white rounded box */}
      <div className="bg-white px-8 py-3 rounded-full shadow-lg mb-20"> {/* Increased margin-bottom */}
        <h1 className="text-3xl font-['CPN'] font-bold text-black">กรุณารอสักครู่</h1>
      </div>

      {/* Custom Loading Spinner */}
      {/* This will create the pink star-like shape with a white loading animation inside */}
      <div className="relative w-48 h-48 flex items-center justify-center">
        {/* Outer pink star shape */}
        <svg viewBox="0 0 100 100" className="absolute w-full h-full text-[#F49C9B]">
          <path
            fill="currentColor"
            d="M 50 0 L 60 40 L 100 50 L 60 60 L 50 100 L 40 60 L 0 50 L 40 40 Z"
          />
        </svg>
        
        {/* Inner white circle for the actual spinner */}
        <div className="absolute w-28 h-28 bg-white rounded-full flex items-center justify-center">
          {/* Tailwind CSS spinner */}
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-pink-500"></div>
        </div>
      </div>
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
  const [uniqueUserId, setUniqueUserId] = useState<string | null>(null);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const userId = urlParams.get('uid');
    if (userId) {
      setUniqueUserId(userId);
    }

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
      if (gameState === GameState.WAITING_QUEUE) {
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
    
    // Emit with playerName and the userId (which can be null if not from LINE)
    socket.current?.emit('joinGame', { 
      userId: uniqueUserId, // This is the state holding the ID from the URL
      playerName: name 
    });
  }, [uniqueUserId]);

  const renderContent = () => {
    switch (gameState) {
      case GameState.SETUP:
        return <SetupScreen onJoin={handleJoin} />;
      case GameState.WAITING_QUEUE:
        return <WaitingScreen />;
      case GameState.CONTROLLER:
        return <ControllerScreen socket={socket.current} playerName={playerName} />;
      case GameState.ENDGAME:
        return <EndScreen finalScore={finalScore} playerName={playerName} />;
      default:
        return <WaitingScreen />;
    }
  };

  return (
    <div className="h-screen w-screen text-white overflow-hidden select-none">
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