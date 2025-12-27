import express from "express";
import http from "http";
import fs from "fs";
import path from "path";
import { Server } from "socket.io";
import { fileURLToPath } from "url";
import multer from "multer";

/* ================= SETUP ================= */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

/* ================= MIDDLEWARE ================= */
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

/* ================= FILE HELPERS ================= */
const ensureFile = (file) => {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, "[]");
};

const readJSON = (file) => {
  try {
    ensureFile(file);
    const content = fs.readFileSync(file, "utf8").trim();
    if (!content) return [];
    return JSON.parse(content);
  } catch (err) {
    console.error("⚠️ JSON buzilgan, tozalandi:", file);
    fs.writeFileSync(file, "[]");
    return [];
  }
};

const writeJSON = (file, data) => {
  ensureFile(file);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
};

/* ================= FILE PATHS ================= */
const USERS_FILE = path.join(__dirname, "data/users.json");
const MESSAGES_FILE = path.join(__dirname, "data/messages.json");
const MEDIA_FILE = path.join(__dirname, "data/media.json");

/* ================= LOGIN ================= */
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ ok: false, msg: "Ma'lumot yetarli emas" });
  }

  const users = readJSON(USERS_FILE);
  let user = users.find(u => u.username === username);

  if (!user) {
    user = { id: Date.now(), username, password, createdAt: new Date().toISOString() };
    users.push(user);
    writeJSON(USERS_FILE, users);
  }

  res.json({ ok: true, user });
});

/* ================= SOCKET ================= */
io.on("connection", socket => {
  console.log("🔌 User connected:", socket.id);

  socket.on("join-room", ({ room, user }) => {
    if (!room || !user) return;

    socket.join(room);
    socket.room = room;
    socket.user = user;

    // 1️⃣ roomdagi boshqa userlar idlarini yuborish
    const clients = Array.from(io.sockets.adapter.rooms.get(room) || []).filter(id => id !== socket.id);
    socket.emit("all-users", clients);

    // 2️⃣ boshqa userlarga yangi user kelganini aytish
    socket.to(room).emit("user-joined", { id: socket.id, user });
  });

  // chat message
  socket.on("chat-message", msg => {
    if (!socket.room || !socket.user) return;
    const messages = readJSON(MESSAGES_FILE);
    messages.push({ room: socket.room, user: socket.user, text: msg, time: new Date().toISOString() });
    writeJSON(MESSAGES_FILE, messages);

    io.to(socket.room).emit("chat-message", { user: socket.user, msg });
  });

  // WebRTC signaling
  socket.on("signal", ({ to, data }) => {
    if (!to || !data) return;
    socket.to(to).emit("signal", { from: socket.id, data });
  });

  // user disconnect
  socket.on("disconnect", () => {
    console.log("❌ User disconnected:", socket.id);
    if (socket.room) {
      socket.to(socket.room).emit("user-left", socket.id);
    }
  });
});

/* ================= AUDIO UPLOAD ================= */
const upload = multer({ dest: "uploads/audio" });
app.post("/upload-audio", upload.single("audio"), (req, res) => {
  const media = readJSON(MEDIA_FILE);
  media.push({
    type: "audio",
    user: req.body.user,
    room: req.body.room,
    file: req.file.path,
    time: new Date().toISOString()
  });
  writeJSON(MEDIA_FILE, media);
  res.json({ ok: true });
});

/* ================= START ================= */
server.listen(3000, () => {
  console.log("✅ Server running: http://localhost:3000");
});
