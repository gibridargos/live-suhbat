/* ================= SOCKET ================= */
const socket = io();

/* ================= PARAMS ================= */
const params = new URLSearchParams(window.location.search);
const username = params.get("u");
const room = params.get("r");

/* ================= DOM ================= */
const videos = document.getElementById("videos");
const msgInput = document.getElementById("msg");
const messagesBox = document.getElementById("messages");

/* ================= WEBRTC ================= */
const peers = {};
let localStream;

/* ================= INIT ================= */
init();

async function init() {
  localStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
  });

  addVideo(localStream, "me");

  socket.emit("join-room", {
    room,
    user: username
  });
}

/* ================= SOCKET EVENTS ================= */
socket.on("user-joined", ({ id }) => {
  const pc = createPeer(id);
  localStream.getTracks().forEach(track =>
    pc.addTrack(track, localStream)
  );
});

socket.on("signal", async ({ from, data }) => {
  let pc = peers[from];
  if (!pc) pc = createPeer(from);

  if (data.sdp) {
    await pc.setRemoteDescription(
      new RTCSessionDescription(data.sdp)
    );

    if (data.sdp.type === "offer") {
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("signal", {
        to: from,
        data: { sdp: pc.localDescription }
      });
    }
  }

  if (data.candidate) {
    await pc.addIceCandidate(
      new RTCIceCandidate(data.candidate)
    );
  }
});

/* ================= PEER ================= */
function createPeer(id) {
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  });

  pc.ontrack = (e) => {
    if (!document.getElementById(id)) {
      addVideo(e.streams[0], id);
    }
  };

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      socket.emit("signal", {
        to: id,
        data: { candidate: e.candidate }
      });
    }
  };

  pc.createOffer().then(async offer => {
    await pc.setLocalDescription(offer);
    socket.emit("signal", {
      to: id,
      data: { sdp: pc.localDescription }
    });
  });

  peers[id] = pc;
  return pc;
}

/* ================= VIDEO ================= */
function addVideo(stream, id) {
  const video = document.createElement("video");
  video.id = id;
  video.srcObject = stream;
  video.autoplay = true;
  video.playsInline = true;
  videos.appendChild(video);
}

/* ================= CHAT ================= */
msgInput.addEventListener("keydown", e => {
  if (e.key === "Enter" && msgInput.value.trim()) {
    socket.emit("chat-message", msgInput.value);
    msgInput.value = "";
  }
});

socket.on("chat-message", ({ user, msg }) => {
  const p = document.createElement("p");
  p.innerHTML = `<b>${user}:</b> ${msg}`;
  messagesBox.appendChild(p);
  messagesBox.scrollTop = messagesBox.scrollHeight;
});
