import express from 'express';
import http from 'http';
import { Server, Socket } from 'socket.io';
import path from 'path';

// --- APPLICATION SETUP ---
const app = express();

// Serve the static files from the React app
app.use(express.static(path.join(__dirname, 'public')));

// Handles any requests that don't match the ones above
app.get('*', (req,res) =>{
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

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
  score: number;
}

// Queue for players waiting for their turn
let playerQueue: Player[] = [];
// The player who is currently playing
let activePlayer: Player | null = null;
// Holds the NodeJS.Timeout instance for the current round
let roundTimer: ReturnType<typeof setTimeout> | null = null;
// Holds the socket for the single Unreal Engine game client
let gameClientSocket: Socket | null = null;


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
    console.log(`Round ended for ${activePlayer.name}. Final score: ${activePlayer.score}`);
    // Notify the player's client that their game is over
    io.to(activePlayer.id).emit('gameOver', { finalScore: activePlayer.score });
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
    if (gameClientSocket) {
      gameClientSocket.emit('waitingForPlayers');
    }
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
  if (gameClientSocket) {
    gameClientSocket.emit('roundStart', { playerName: player.name });
  }

  // Set a timer for the round duration
  roundTimer = setTimeout(endRound, ROUND_DURATION_MS);
};


// --- SOCKET.IO EVENT HANDLING ---
io.on('connection', (socket: Socket) => {
  console.log(`New client connected: ${socket.id}. Waiting for registration.`);

  // Event: Client identifies itself
  socket.on('register', ({ client_type }: { client_type: 'game_client' | 'web_controller' }) => {
    if (client_type === 'game_client') {
      if (gameClientSocket) {
        console.warn(`A game client tried to connect (${socket.id}), but one is already registered (${gameClientSocket.id}). Disconnecting new client.`);
        socket.disconnect();
        return;
      }
      gameClientSocket = socket;
      console.log(`Unreal Engine game client registered: ${socket.id}`);

      // Listen for game-initiated round end events
      socket.on('roundOverByGame', () => {
        if (socket.id === gameClientSocket?.id) {
            console.log("Received 'roundOverByGame' from game client. Ending round.");
            endRound();
        }
      });

      // Listen for score updates from the game client
      socket.on('updateScore', (data: { score: number }) => {
        if (socket.id === gameClientSocket?.id && activePlayer) {
          activePlayer.score = data.score;
          // Forward the score to the active player's web controller
          io.to(activePlayer.id).emit('scoreUpdate', { score: data.score });
        }
      });

      // If no one is playing, notify the new game client immediately.
      if (!activePlayer) {
        gameClientSocket.emit('waitingForPlayers');
      }

    } else if (client_type === 'web_controller') {
      console.log(`Web controller registered: ${socket.id}`);
    } else {
      console.log(`Client ${socket.id} sent unknown client_type '${client_type}'. Disconnecting.`);
      socket.disconnect();
    }
  });

  // Event: Player joins the game
  socket.on('joinGame', ({ playerName }: { playerName: string }) => {
    // Ensure the game client cannot join the player queue
    if (socket.id === gameClientSocket?.id) return;

    const newPlayer: Player = { id: socket.id, name: playerName, score: 0 };
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
      // Valid move, send it ONLY to the Unreal Engine client
      if (gameClientSocket) {
        gameClientSocket.emit('gameAction', data);
      }
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

  // Event: Client disconnects
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);

    // Check if the disconnected client was the game client
    if (gameClientSocket && socket.id === gameClientSocket.id) {
        console.log("Unreal Engine game client has disconnected.");
        gameClientSocket = null;
        // Optional: End the current round if the game disconnects
        if(activePlayer) {
          console.log("Ending current round because game client disconnected.");
          endRound();
        }
        return; // No further action needed
    }

    // If it wasn't the game client, it's a player.
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
});
