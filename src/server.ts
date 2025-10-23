import express from 'express';
import http from 'http';
import { Server, Socket } from 'socket.io';
import path from 'path';


const app = express();

// Serve the static files (corrected path for development, assuming build places it correctly)
// NOTE: For development, ensure your build process or dev server handles static files correctly.
// This path assumes the 'public' folder is relative to the compiled 'dist' directory.
app.use(express.static(path.join(__dirname, 'public')));

// Handles any requests that don't match the ones above
app.get('*', (req,res) =>{
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins for simple case
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3001;
const ROUND_DURATION_MS = 30000; // 30 seconds per round
const PREPARE_DURATION_MS = 3000; // 3 seconds to prepare
const UE_SCORE_TIMEOUT_MS = 300; // **NEW**: 0.3 seconds timeout for UE to send score

// --- STATE MANAGEMENT ---
interface Player {
  id: string; // The socket ID
  name: string;
  score: number;
  userId: string; // The unique ID to be saved
  // **NEW**: Flag เพื่อติดตามว่ารอบจบลงตามปกติหรือไม่
  roundEndedNormally?: boolean;
}

let playerQueue: Player[] = [];
let activePlayer: Player | null = null;
let roundTimer: ReturnType<typeof setTimeout> | null = null;
let gameClientSocket: Socket | null = null;
let countdownTimer: ReturnType<typeof setInterval> | null = null;
let roundEndTime: number = 0;
// **NEW**: Flags เพื่อจัดการการเปลี่ยนสถานะและป้องกัน race conditions/การประมวลผลซ้ำซ้อน
let isAssigningPlayer: boolean = false;
let isRoundEnding: boolean = false;

// ... ค่าคงที่ timeout ...
let ueNotReadyTimeout: ReturnType<typeof setTimeout> | null = null;
// =================================================================
// === ⬇️ ตรวจสอบว่ามีบรรทัดนี้อยู่ และสะกดถูกต้อง ⬇️ ===
//
// Flag บอกว่าเรากำลังรอ UE ตอบรับว่าพร้อม (หลัง UE ส่ง "notready")
let isWaitingForUeReady: boolean = false; // <--- ต้องมีบรรทัดนี้
//
// === ⬆️ จบส่วนที่ตรวจสอบ ⬆️ ===
// =================================================================

// --- CORE FUNCTIONS ---

/**
 * บังคับจบรอบปัจจุบัน ใช้สำหรับกรณีหลุดการเชื่อมต่อหรือเกิดข้อผิดพลาด
 * @param reason เหตุผล (ถ้ามี) สำหรับการจบรอบ
 */


// **NEW**: เพิ่มตัวแปรสำหรับเก็บ timeout การขอคะแนน
let scoreRequestTimeout: ReturnType<typeof setTimeout> | null = null;

const forceEndRound = (reason?: string) => {
  if (!activePlayer || isRoundEnding) return;

  console.log(`Force ending round for ${activePlayer.name}. Reason: ${reason || 'Unknown'}`);
  isRoundEnding = true;
  activePlayer.roundEndedNormally = false;

  if (roundTimer) clearTimeout(roundTimer);
  roundTimer = null;
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = null;
  // **NEW**: เคลียร์ score timeout ที่อาจมีอยู่
  if (scoreRequestTimeout) clearTimeout(scoreRequestTimeout);
  scoreRequestTimeout = null;

  if (gameClientSocket) {
    console.log('Sending forceEndRound and requestFinalScore to UE client.');
    gameClientSocket.emit('forceEndRound');
    gameClientSocket.emit('requestFinalScore');

    // **NEW**: เริ่มจับเวลา timeout สำหรับรอคะแนนจาก UE
    const playerToEnd = activePlayer; // เก็บ context ของผู้เล่นไว้สำหรับ timeout
    scoreRequestTimeout = setTimeout(() => {
        console.warn(`UE score submission timed out for ${playerToEnd.name}. Using last known score: ${playerToEnd.score}`);
        // ตรวจสอบให้แน่ใจว่ารอบยังไม่ได้ถูกประมวลผลไปแล้วจากการส่งคะแนนที่ล่าช้า
        if (isRoundEnding && activePlayer === playerToEnd) {
             processEndOfRound(playerToEnd.score);
        }
        scoreRequestTimeout = null; // เคลียร์ ref ของ timer
    }, UE_SCORE_TIMEOUT_MS);

  } else {
    console.warn('Cannot request final score from UE: Game client disconnected.');
    processEndOfRound(activePlayer.score); // ประมวลผลทันที
  }
};


/**
 * ถูกเรียกเมื่อหมดเวลาตามปกติ
 */
const handleTimeUp = () => {
  if (!activePlayer || isRoundEnding) return;

  console.log(`Normal time up for ${activePlayer.name}.`);
  isRoundEnding = true;
  activePlayer.roundEndedNormally = true;

  if (roundTimer) clearTimeout(roundTimer);
  roundTimer = null;
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = null;
  // **NEW**: เคลียร์ score timeout ที่อาจมีอยู่
  if (scoreRequestTimeout) clearTimeout(scoreRequestTimeout);
  scoreRequestTimeout = null;

  if (gameClientSocket) {
    console.log('Requesting final score from game.');
    gameClientSocket.emit('requestFinalScore');

    // **NEW**: เริ่มจับเวลา timeout สำหรับรอคะแนนจาก UE
    const playerToEnd = activePlayer; // เก็บ context ของผู้เล่นไว้สำหรับ timeout
    scoreRequestTimeout = setTimeout(() => {
        console.warn(`UE score submission timed out for ${playerToEnd.name}. Using last known score: ${playerToEnd.score}`);
         // ตรวจสอบให้แน่ใจว่ารอบยังไม่ได้ถูกประมวลผลไปแล้วจากการส่งคะแนนที่ล่าช้า
         if (isRoundEnding && activePlayer === playerToEnd) {
             processEndOfRound(playerToEnd.score);
         }
        scoreRequestTimeout = null; // เคลียร์ ref ของ timer
    }, UE_SCORE_TIMEOUT_MS);

  }
  else {
    console.warn('Cannot request final score from UE at time up: Game client disconnected.');
    processEndOfRound(activePlayer.score); // ประมวลผลทันที
  }
};
/**
 * ประมวลผลการสิ้นสุดรอบ
 * @param finalScore คะแนนที่ได้รับจาก game client
 */
const processEndOfRound = (finalScore: number) => {
  // **FIX 8**: ตรวจสอบให้แน่ใจว่าฟังก์ชันนี้ทำงานเพียงครั้งเดียวต่อเซสชันของผู้เล่นที่กำลังเล่นอยู่
  if (!activePlayer || !isRoundEnding) {
    console.warn('processEndOfRound called unexpectedly or redundantly.');
    return;
  }

  const endedPlayer = activePlayer; // เก็บข้อมูลผู้เล่นที่กำลังจะจบ
  activePlayer = null; // ล้าง active player *ก่อน* การทำงานแบบ async หรือการเริ่มคนถัดไป

  try {
    // อัปเดตคะแนน
    endedPlayer.score = finalScore;
    console.log(`Processing end of round for ${endedPlayer.name}. Final score: ${endedPlayer.score}. Ended normally: ${endedPlayer.roundEndedNormally}`);

    // 1. เตรียมข้อมูลสำหรับ Unreal
    const gameResult = {
      userId: endedPlayer.userId,
      playerName: endedPlayer.name,
      totalScore: endedPlayer.score,
      timestamp: new Date().toISOString(),
      // **NEW**: เพิ่ม flag บอกว่าจบรอบอย่างไร
      completedNormally: endedPlayer.roundEndedNormally ?? false
    };

    // 2. ส่งข้อมูลไป Unreal (ถ้าเชื่อมต่ออยู่)
    if (gameClientSocket) {
      gameClientSocket.emit('recordGameSession', gameResult);
    } else {
      console.warn(`Cannot send recordGameSession for ${endedPlayer.name}: Game client disconnected.`);
      // =================================================================
      // === ⬇️ เพิ่มโค้ดส่วนนี้ ⬇️ ===
      // **สำคัญมาก**: ถ้า UE ไม่ได้เชื่อมต่อ (หลุด)
      // เราจะไม่มีวันได้รับ 'gamegotolandingpage'
      // ดังนั้นเราต้องสั่งเริ่มคนถัดไปทันที เพื่อไม่ให้คิวค้าง
      startNextPlayer(); 
      // === ⬆️ จบส่วนที่เพิ่ม ⬆️ ===
      // =================================================================
    }

    // 3. แจ้ง web controller
    io.to(endedPlayer.id).emit('gameOver', { finalScore: endedPlayer.score });

  } catch (error) {
    console.error(`Error during processEndOfRound for ${endedPlayer.name}:`, error);
    // อาจแจ้งเตือนผู้ใช้หรือแอดมินที่นี่
  } finally {
    isRoundEnding = false; // รีเซ็ต flag *หลังจาก* ประมวลผลเสร็จสิ้น

  }
};

/**
 * เริ่มผู้เล่นคนถัดไปจากคิว
 */
const startNextPlayer = () => {
   // **FIX 7**: ตรวจสอบ lock ก่อนดำเนินการต่อ
  if (isAssigningPlayer) return;

  if (playerQueue.length > 0) {
    isAssigningPlayer = true; // **FIX 7**: ตั้งค่า lock
    const nextPlayer = playerQueue.shift()!;
    console.log(`Next player is ${nextPlayer.name}. Preparing their round.`);

    // อัปเดตผู้เล่นที่เหลือในคิวเกี่ยวกับตำแหน่งใหม่
    playerQueue.forEach((player, index) => {
        io.to(player.id).emit('queueUpdate', { position: index + 1, total: playerQueue.length });
    });

    // เตรียมรอบ (ซึ่งจะปลด lock ในภายหลัง)
    prepareRound(nextPlayer);

  } else {
    console.log("Queue is empty. Waiting for new players.");
    io.emit('gameAvailable');
    if (gameClientSocket) {
      gameClientSocket.emit('waitingForPlayers');
    }
    // ไม่จำเป็นต้อง lock ถ้าคิวว่าง
  }
};

/**
 * เตรียมผู้เล่นสำหรับรอบด้วยการนับถอยหลัง
 * @param player ผู้เล่นที่จะเตรียม
 */
const prepareRound = (player: Player) => {
  // **FIX 6**: ครอบด้วย try...catch
  try {
    console.log(`Player ${player.name} is preparing to play.`);

    // =================================================================
    // === ⬇️ กำหนด activePlayer เร็วขึ้นตรงนี้ ⬇️ ===
    activePlayer = player; // ตั้งค่าชั่วคราวเพื่อให้ 'notready' หาเจอ
    isWaitingForUeReady = false; // ตรวจสอบว่า flag การรอถูกรีเซ็ตสำหรับผู้เล่นใหม่
    if (ueNotReadyTimeout) { // เคลียร์ timeout ที่อาจค้างอยู่
      clearTimeout(ueNotReadyTimeout);
      ueNotReadyTimeout = null;
    }
    // === ⬆️ จบส่วนที่แก้ไข ⬆️ ===
    // =================================================================

    io.to(player.id).emit('prepareToPlay', { duration: PREPARE_DURATION_MS });

    // **MODIFIED: Send roundStart to UE immediately at countdown start**
    if (gameClientSocket) {
      console.log(`Sending roundStart to UE for ${player.name} (during preparation).`);
      gameClientSocket.emit('roundStart', { playerName: player.name });
    } else {
      console.warn(`Cannot send roundStart for ${player.name}: Game client disconnected.`);
    }

    setTimeout(() => {
      // =================================================================
        // === ⬇️ เพิ่มการตรวจสอบนี้ตรงนี้ ⬇️ ===
        //
        // ตรวจสอบ *อีกครั้ง* ว่า UE ส่ง 'notready' มา *ระหว่าง* การนับถอยหลังเตรียมตัวหรือไม่
        if (isWaitingForUeReady && activePlayer && activePlayer.id === player.id) {
            console.log(`Prepare duration ended for ${player.name}, but still waiting for UE ready signal (received 'notready'). Delaying startRound.`);
            // ยังไม่ต้องเริ่มรอบ รอ 'gamegotolandingpage' หรือ timeout 5 นาที
        } else if (activePlayer && activePlayer.id !== player.id) {
            // กรณีนี้จัดการหาก active player เปลี่ยนไปโดยไม่คาดคิดระหว่าง prepare
             console.warn(`Prepare duration ended for ${player.name}, but active player is now ${activePlayer?.name}. Aborting startRound for ${player.name}.`);
             // อาจต้องแน่ใจว่าผู้เล่นที่ถูกต้องได้เริ่มในที่สุด
             // แต่ตอนนี้ แค่ป้องกันไม่ให้คนผิดเริ่ม
             isAssigningPlayer = false; // ปลดล็อคเพราะความพยายามนี้ล้มเหลว
        }
         else {
            // ถ้าเรา *ไม่ได้* กำลังรอ UE ให้ดำเนินการเริ่มรอบ
            console.log(`Prepare duration ended for ${player.name}. Proceeding to startRound.`);
            startRound(player); // เรียก startRound เฉพาะเมื่อ UE ไม่ได้บอกว่า "notready"
        }
        //
        // === ⬆️ จบการตรวจสอบที่เพิ่มเข้ามา ⬆️ ===
        // =================================================================
    }, PREPARE_DURATION_MS);

  } catch (error) {
    console.error(`Error during prepareRound for ${player.name}:`, error);
    // พยายามกู้คืน: ลบผู้เล่น, แจ้งเตือน, เริ่มคนถัดไป
    io.to(player.id).emit('error', { message: 'Failed to start your round.' });
    isAssigningPlayer = false; // **FIX 7**: ปลด lock เมื่อเกิดข้อผิดพลาด
    startNextPlayer();
  }
};

/**
 * เริ่มรอบใหม่สำหรับผู้เล่นที่กำหนด
 * @param player ผู้เล่นที่ถึงตา
 */
// ในไฟล์ server.ts
const startRound = (player: Player) => {
   try {
    // ตรวจสอบความปลอดภัย: ตรวจสอบว่าผู้เล่นที่ส่งเข้ามาเป็น active player ที่ตั้งใจไว้ในปัจจุบันหรือไม่
    if (!activePlayer || activePlayer.id !== player.id) {
        console.warn(`startRound called for ${player.name}, but activePlayer is ${activePlayer?.name}. Aborting.`);
        isAssigningPlayer = false; // ปลดล็อคถ้าเรากำลังยกเลิก
        return;
    }

    // ตรวจสอบว่าเรายังรอ UE อยู่หรือไม่ (อาจเกิดขึ้นได้หาก timer 5 นาทีเรียกฟังก์ชันนี้)
    if (isWaitingForUeReady) {
        console.log(`startRound called for ${player.name}, but still waiting for UE ready signal.`);
        // ไม่ต้องดำเนินการต่อ isAssigningPlayer ยังคงเป็น true
        return;
    }

    // --- รอบกำลังจะเริ่ม *จริงๆ* ณ ตอนนี้ ---
    console.log(`Starting round for ${player.name}. Duration: ${ROUND_DURATION_MS / 1000}s`);

    // ตรวจสอบว่า flags ถูกต้องสำหรับรอบที่กำลังดำเนินอยู่
    // activePlayer = player; // ลบออก - ตั้งค่าแล้วใน prepareRound
    activePlayer.roundEndedNormally = undefined;
    roundEndTime = Date.now() + ROUND_DURATION_MS;
    isRoundEnding = false;
    isWaitingForUeReady = false; // รีเซ็ต flag การรอ *ที่นี่*
    if (ueNotReadyTimeout) { // เคลียร์ timer 5 นาที *ที่นี่*
       clearTimeout(ueNotReadyTimeout);
       ueNotReadyTimeout = null;
    }

    // แจ้ง controller
    io.to(player.id).emit('yourTurn');

    // เริ่ม timer เกม
    roundTimer = setTimeout(handleTimeUp, ROUND_DURATION_MS);

    // เริ่ม timer นับถอยหลัง
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = setInterval(() => {
      const remaining = Math.max(0, roundEndTime - Date.now());
      // ตรวจสอบว่า activePlayer ยังอยู่และตรงกันก่อนส่งข้อมูล
      if (activePlayer && activePlayer.id === player.id) {
        io.to(activePlayer.id).emit('timeUpdate', { remaining });
      } else {
        clearInterval(countdownTimer!);
        countdownTimer = null;
      }
    }, 1000);

  } catch (error) {
     console.error(`Error during startRound for ${player.name}:`, error);
     io.to(player.id)?.emit('error', { message: 'Failed to properly start your round.' });
     // พยายาม force end หากผู้เล่นตรงกัน
     if (activePlayer && activePlayer.id === player.id) {
        forceEndRound('Error during startRound');
     }
     // ตรวจสอบให้แน่ใจว่าปลดล็อคแม้เกิด error
     isAssigningPlayer = false;

  } finally {
     // ปลดล็อคการกำหนดค่า *เฉพาะ* เมื่อ startRound ทำงานสำเร็จหรือเกิด error ที่นี่
     // มันยังคงเป็น true ถ้า startRound return เร็วกว่ากำหนดเนื่องจาก isWaitingForUeReady
     if (!isWaitingForUeReady) { // ปลดล็อคเฉพาะเมื่อเราไม่ได้ออกกลางคันเนื่องจากการรอ
        isAssigningPlayer = false;
     }
  }
};


// --- SOCKET.IO EVENT HANDLING ---
io.on('connection', (socket: Socket) => {
  console.log(`New client connected: ${socket.id}. Waiting for registration.`);

  socket.on('register', ({ client_type }: { client_type: 'game_client' | 'web_controller' }) => {
    if (client_type === 'game_client') {
      if (gameClientSocket) {
        console.warn(`A game client tried to connect (${socket.id}), but one is already registered (${gameClientSocket.id}). Disconnecting new client.`);
        socket.disconnect();
        return;
      }
      gameClientSocket = socket;
      console.log(`Unreal Engine game client registered: ${socket.id}`);

      // รอรับคะแนนสุดท้าย
      socket.on('submitFinalScore', (data: { score: number }) => {
        // **FIX 8**: ตรวจสอบว่าเรากำลังรอคะแนนอยู่หรือไม่ และเป็น client ที่ถูกต้องหรือไม่
        if (socket.id === gameClientSocket?.id && activePlayer && isRoundEnding) {
          console.log(`Received final score ${data.score} from UE for ${activePlayer.name}`);
          
          // **NEW**: เคลียร์ timeout เนื่องจากเราได้รับคะแนนแล้ว
          if (scoreRequestTimeout) {
              clearTimeout(scoreRequestTimeout);
              scoreRequestTimeout = null;
          }
          
          processEndOfRound(data.score);
        } else {
            console.warn(`submitFinalScore received unexpectedly from ${socket.id}. ActivePlayer: ${activePlayer?.name}, isRoundEnding: ${isRoundEnding}`);
        }
      });

      // รอรับการอัปเดตคะแนน
      socket.on('updateScore', (data: { score: number }) => {
        if (socket.id === gameClientSocket?.id && activePlayer && !isRoundEnding) {
          activePlayer.score = data.score;
          io.to(activePlayer.id).emit('scoreUpdate', { score: data.score });
        }
      });

      // ตรวจสอบว่า listener นี้อยู่ในตำแหน่งที่ถูกต้องและสะกดถูก
      // ในไฟล์ server.ts, ภายใน io.on('connection'...), ภายในส่วน register ของ game_client
      socket.on('notready', () => {
          // เพิ่มการตรวจสอบ: ตรวจสอบให้แน่ใจว่า activePlayer ไม่ใช่ null และเราไม่ได้กำลังรออยู่แล้ว
          if (socket.id === gameClientSocket?.id && activePlayer && !isWaitingForUeReady) {
              console.warn(`✅ UE reported "notready" for player ${activePlayer.name}. Setting wait flag.`);
              isWaitingForUeReady = true;

              io.to(activePlayer.id).emit('waitingForGame');

              // หยุด timer ที่อาจถูกเริ่มโดย startRound หากมันทำงานไปชั่วครู่
              if (roundTimer) clearTimeout(roundTimer);
              roundTimer = null;
              if (countdownTimer) clearInterval(countdownTimer);
              countdownTimer = null;

              // เคลียร์และตั้งค่า timer retry 5 นาที
              if (ueNotReadyTimeout) clearTimeout(ueNotReadyTimeout);
              const playerToRetry = activePlayer; // เก็บ context ผู้เล่นปัจจุบัน

              ueNotReadyTimeout = setTimeout(() => {
                  console.log(`5-minute UE ready timeout reached for ${playerToRetry.name}. Retrying...`);
                  ueNotReadyTimeout = null;
                  // ตรวจสอบว่า state ยังคงถูกต้องสำหรับการ retry หรือไม่
                  if (activePlayer && activePlayer.id === playerToRetry.id && isWaitingForUeReady) {
                      console.log(`Retrying startRound for ${playerToRetry.name} after timeout.`);
                      // isWaitingForUeReady = false; // ให้ startRound รีเซ็ตเอง
                      startRound(activePlayer); // เรียก startRound อีกครั้ง
                  } else {
                      console.warn(`5-min retry timeout fired, but state has changed (player: ${activePlayer?.name}, waiting: ${isWaitingForUeReady}).`);
                      // ถ้า state เปลี่ยนไป, ตรวจสอบให้แน่ใจว่าล็อคไม่ถูกค้างไว้ตลอดไป
                      if(isAssigningPlayer && (!activePlayer || activePlayer.id !== playerToRetry.id)) {
                          isAssigningPlayer = false;
                      }
                  }
              // }, UE_READY_TIMEOUT_MS); // ใช้ค่าคงที่
              }, 5000); // คงไว้ 5 วินาทีเพื่อทดสอบ - อย่าลืมเปลี่ยนกลับ

          } else {
              console.log(`'notready' received but ignored. Conditions: gameClient=${socket.id === gameClientSocket?.id}, activePlayer=${!!activePlayer}, !isWaiting=${!isWaitingForUeReady}`);
          }
      });

      // =================================================================
      // === ⬇️ เพิ่มโค้ดส่วนนี้ ⬇️ ===
      //
      // รอรับสัญญาณว่า UE กลับไปหน้า Landing Page และพร้อมสำหรับผู้เล่นใหม่
      socket.on('gamegotolandingpage', () => {
        if (socket.id === gameClientSocket?.id) {
          console.log('✅ UE is on landing page and ready for next player.');
          
          // เมื่อ UE พร้อมเท่านั้น จึงจะเริ่มผู้เล่นคนถัดไป
          // (ตรวจสอบให้แน่ใจว่าไม่ได้กำลังอยู่ในกระบวนการจบรอบ หรือมีคนเล่นอยู่)
          if (!isRoundEnding && !activePlayer) {
            startNextPlayer();
          } else {
            console.warn('UE sent gamegotolandingpage, but server is still busy.');
          }
        }
      });
      // === ⬆️ จบส่วนที่เพิ่ม ⬆️ ===
      // =================================================================

      if (!activePlayer && playerQueue.length === 0) {
        gameClientSocket.emit('waitingForPlayers');
      } else if (activePlayer) {
          // หาก game client เชื่อมต่อเข้ามากลางรอบ ให้แจ้งข้อมูล
           gameClientSocket.emit('roundStart', { playerName: activePlayer.name });
      }

    } else if (client_type === 'web_controller') {
      console.log(`Web controller registered: ${socket.id}`);
      socket.emit('connectionStatus', { isGameActive: activePlayer !== null || playerQueue.length > 0 }); // พิจารณาคิวด้วย
    } else {
      console.log(`Client ${socket.id} sent unknown client_type '${client_type}'. Disconnecting.`);
      socket.disconnect();
    }
  });

  socket.on('joinGame', ({ userId, playerName }: { userId?: string, playerName: string }) => {
    if (socket.id === gameClientSocket?.id) return;
    // ป้องกันการเข้าร่วมซ้ำหากอยู่ในคิวหรือกำลังเล่นอยู่แล้ว
    if (activePlayer?.id === socket.id || playerQueue.some(p => p.id === socket.id)) {
        console.warn(`Player ${playerName} (${socket.id}) tried to join again.`);
        return;
    }

    const finalUserId = userId || socket.id;
    console.log(`Player "${playerName}" (User ID: ${finalUserId}) wants to join.`);

    const newPlayer: Player = {
      id: socket.id,
      name: playerName,
      score: 0,
      userId: finalUserId
    };

    // **FIX 7**: ใช้ lock ก่อนตรวจสอบ/กำหนดค่า
    if (!activePlayer && playerQueue.length === 0 && !isAssigningPlayer) {
      isAssigningPlayer = true; // ตั้งค่า lock
      prepareRound(newPlayer); // ฟังก์ชันนี้จะปลด lock ใน startRound/error
    } else {
      playerQueue.push(newPlayer);
      console.log(`${playerName} added to queue. Position: ${playerQueue.length}`);
      socket.emit('queueUpdate', { position: playerQueue.length, total: playerQueue.length });
    }
  });

  socket.on('move', (data: { direction: 'left' | 'right', action: 'start' | 'stop' }) => {
    // อนุญาตการเคลื่อนที่จาก active player เท่านั้น และเมื่อรอบยังไม่จบ
    if (activePlayer && socket.id === activePlayer.id && !isRoundEnding) {
      if (gameClientSocket) {
        gameClientSocket.emit('gameAction', data);
      }
    }
  });

  // Event: ผู้เล่นจบเกมเอง (คงไว้เหมือนเดิม, handleTimeUp ตอนนี้ตั้งค่า isRoundEnding แล้ว)
  socket.on('endGame', () => {
    if (activePlayer && socket.id === activePlayer.id) {
      console.log(`Active player ${activePlayer.name} ended their game manually.`);
      handleTimeUp(); // เปลี่ยนจาก forceEndRound, เพราะการจบเองเหมือนหมดเวลา
    }
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);

    // **FIX 3**: ล้าง game client socket ทันทีหากหลุดการเชื่อมต่อ
    if (gameClientSocket && socket.id === gameClientSocket.id) {
        console.log("Unreal Engine game client has disconnected.");
        gameClientSocket = null;
        // บังคับจบรอบปัจจุบันหาก UE หลุด
        if(activePlayer) {
          forceEndRound('Game client disconnected'); // ใช้ forceEndRound
        }
        return;
    }

    // จัดการ Web Controller หลุด
    if (activePlayer && socket.id === activePlayer.id) {
      // **FIX 2**: ใช้ forceEndRound สำหรับผู้เล่นหลุด
      forceEndRound('Player disconnected');
    } else {
      const queueIndex = playerQueue.findIndex(p => p.id === socket.id);
      if (queueIndex !== -1) {
        const removedPlayer = playerQueue.splice(queueIndex, 1)[0];
        console.log(`Removed ${removedPlayer.name} from the queue due to disconnect.`);
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