
import express from 'express';
import http from 'http';
import { Server, Socket } from 'socket.io';

// --- APPLICATION SETUP ---
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins for this simple case
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3001;
const ROUND_DURATION_MS = 30000; // 30 seconds per round

// --- STATE MANAGEMENT ---
interface Player {
  id: string; // The socket ID
  name: string;
}

// Queue for players waiting for their turn
let playerQueue: Player[] = [];
// The player who is currently playing
let activePlayer: Player | null = null;
// Holds the NodeJS.Timeout instance for the current round
// FIX: Use ReturnType<typeof setTimeout> to correctly type the timer object from setTimeout in Node.js.
let roundTimer: ReturnType<typeof setTimeout> | null = null;

// --- CORE FUNCTIONS ---

/**
 * Ends the current round, notifies the player, and starts the next round if possible.
 */
const endRound = () => {
  if (roundTimer) {
    clearTimeout(roundTimer);
    roundTimer = null;
  }

  if (activePlayer) {
    console.log(`Round ended for ${activePlayer.name}.`);
    // Notify the player's client that their game is over
    io.to(activePlayer.id).emit('gameOver');
  }
  
  activePlayer = null;

  // Check if there are players waiting in the queue
  if (playerQueue.length > 0) {
    const nextPlayer = playerQueue.shift()!; // Get the next player from the front
    console.log(`Next player is ${nextPlayer.name}. Starting their round.`);
    startRound(nextPlayer);

    // Update remaining players in the queue about their new position
    playerQueue.forEach((player, index) => {
        io.to(player.id).emit('queueUpdate', { position: index + 1, total: playerQueue.length });
    });

  } else {
    console.log("Queue is empty. Waiting for new players.");
    // Notify Unreal Engine that no one is playing
    io.emit('waitingForPlayers');
  }
};

/**
 * Starts a new round for the given player.
 * @param player The player whose turn it is.
 */
const startRound = (player: Player) => {
  activePlayer = player;
  
  console.log(`Starting round for ${player.name}. Duration: ${ROUND_DURATION_MS / 1000}s`);

  // Notify the player's client that it's their turn
  io.to(player.id).emit('yourTurn');
  // Notify Unreal Engine about the new player
  io.emit('roundStart', { playerName: player.name });

  // Set a timer for the round duration
  roundTimer = setTimeout(endRound, ROUND_DURATION_MS);
};


// --- SOCKET.IO EVENT HANDLING ---
io.on('connection', (socket: Socket) => {
  console.log(`New user connected: ${socket.id}`);

  // Event: Player joins the game
  socket.on('joinGame', ({ playerName }: { playerName: string }) => {
    const newPlayer: Player = { id: socket.id, name: playerName };
    console.log(`Player ${playerName} (${socket.id}) wants to join.`);

    if (!activePlayer) {
      // If no one is playing, this player starts immediately.
      startRound(newPlayer);
    } else {
      // If someone is playing, add to the queue.
      playerQueue.push(newPlayer);
      console.log(`${playerName} added to queue. Position: ${playerQueue.length}`);
      // Send an update to the player about their queue position.
      socket.emit('queueUpdate', { position: playerQueue.length, total: playerQueue.length });
    }
  });

  // Event: Player sends a movement command
  socket.on('move', (data: { direction: 'left' | 'right', action: 'start' | 'stop' }) => {
    // SECURITY: Ensure the person sending the move command is the active player.
    if (activePlayer && socket.id === activePlayer.id) {
      // Valid move, broadcast it to the Unreal Engine client
      io.emit('gameAction', data);
    } else {
      // This can happen if a move event arrives after the player's turn has ended.
      // We can safely ignore it.
    }
  });

  // Event: Player manually ends their game
  socket.on('endGame', () => {
    // Only the active player can end the game
    if (activePlayer && socket.id === activePlayer.id) {
      console.log(`Active player ${activePlayer.name} ended their game manually.`);
      endRound();
    }
  });

  // Event: Player disconnects
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);

    // If the disconnected player was the active one, end the round.
    if (activePlayer && socket.id === activePlayer.id) {
      console.log(`Active player ${activePlayer.name} disconnected. Ending round.`);
      endRound();
    } else {
      // If the player was in the queue, remove them.
      const queueIndex = playerQueue.findIndex(p => p.id === socket.id);
      if (queueIndex !== -1) {
        const removedPlayer = playerQueue.splice(queueIndex, 1)[0];
        console.log(`Removed ${removedPlayer.name} from the queue due to disconnect.`);
         // Update remaining players in the queue about their new position
        playerQueue.forEach((player, index) => {
            io.to(player.id).emit('queueUpdate', { position: index + 1, total: playerQueue.length });
        });
      }
    }
  });
});

// --- START SERVER ---
server.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
  // Initial state for Unreal Engine on server start
  io.emit('waitingForPlayers');
});
