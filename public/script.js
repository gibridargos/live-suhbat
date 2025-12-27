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
let micOn = true; // boshlanishda ON
let camOn = true; // boshlanishda ON

/* ================= INIT ================= */
init();

async function init() {
  localStream = await navigator.mediaDevices.getUserMedia({
    video: camOn,
    audio: micOn
  });

  addVideo(localStream, "me", username, micOn, camOn);

  socket.emit("join-room", { room, user: username });
}

/* ================= VIDEO ================= */
function addVideo(stream, id, name = "", mic=false, cam=false) {
  const wrapper = document.createElement("div");
  wrapper.className = "video-box";
  wrapper.id = "box-" + id;

  const video = document.createElement("video");
  video.srcObject = stream;
  video.autoplay = true;
  video.playsInline = true;

  const label = document.createElement("div");
  label.className = "video-name";
  label.innerHTML = `${name} 
    <span id="mic-${id}" style="color:${mic?'lime':'red'}">🎙</span> 
    <span id="cam-${id}" style="color:${cam?'lime':'red'}">📷</span>`;

  wrapper.appendChild(video);
  wrapper.appendChild(label);
  videos.appendChild(wrapper);
}

/* ================= MIC/CAM CONTROL ================= */
document.getElementById("micBtn").onclick = () => {
  micOn = !micOn;
  if(localStream && localStream.getAudioTracks()[0]) localStream.getAudioTracks()[0].enabled = micOn;
  document.getElementById("mic-me").style.color = micOn ? "lime" : "red";
};

document.getElementById("camBtn").onclick = () => {
  camOn = !camOn;
  if(localStream && localStream.getVideoTracks()[0]) localStream.getVideoTracks()[0].enabled = camOn;
  document.getElementById("cam-me").style.color = camOn ? "lime" : "red";
};

/* ================= SOCKET EVENTS ================= */
socket.on("user-joined", ({ id, user }) => {
  const pc = createPeer(id);
  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
});

socket.on("user-left", id => {
  const box = document.getElementById("box-" + id);
  if (box) box.remove();
  if (peers[id]) { peers[id].close(); delete peers[id]; }
});

socket.on("signal", async ({ from, data }) => {
  let pc = peers[from] || createPeer(from);

  if (data.sdp) {
    await pc.setRemoteDescription(data.sdp);
    if (data.sdp.type === "offer") {
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("signal", { to: from, data: { sdp: pc.localDescription } });
    }
  }

  if (data.candidate) await pc.addIceCandidate(data.candidate);
});

/* ================= PEER CONNECTION ================= */
function createPeer(id) {
  const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });

  pc.ontrack = e => {
    if (!document.getElementById("box-" + id)) {
      addVideo(e.streams[0], id, "User", true, true);
    }
  };

  pc.onicecandidate = e => {
    if (e.candidate) socket.emit("signal", { to: id, data: { candidate: e.candidate } });
  };

  pc.createOffer().then(async offer => {
    await pc.setLocalDescription(offer);
    socket.emit("signal", { to: id, data: { sdp: pc.localDescription } });
  });

  peers[id] = pc;
  return pc;
}

/* ================= AUDIO RECORD ================= */
let recorder;
let audioChunks = [];

document.getElementById("recBtn").onclick = async () => {
  if (!recorder) {
    recorder = new MediaRecorder(localStream, { mimeType: 'audio/webm;codecs=opus' });
    recorder.ondataavailable = e => audioChunks.push(e.data);
    recorder.onstop = async () => {
      const blob = new Blob(audioChunks, { type: "audio/mp3" });
      audioChunks = [];
      const fd = new FormData();
      fd.append("audio", blob);
      fd.append("user", username);
      fd.append("room", room);
      await fetch("/upload-audio", { method: "POST", body: fd });
    };
    recorder.start();
  } else {
    recorder.stop();
    recorder = null;
  }
};

/* ================= CHAT ================= */
msgInput.addEventListener("keydown", e => {
  if (e.key === "Enter" && msgInput.value.trim()) {
    socket.emit("chat-message", msgInput.value);
    msgInput.value = "";
  }
});

socket.on("chat-message", ({ user, msg }) => {
  const p = document.createElement("p");
  p.className = user === username ? "self" : "other";
  p.innerHTML = `<span class="username">${user}</span>${msg} <span class="time">${new Date().toLocaleTimeString()}</span>`;
  messagesBox.appendChild(p);
  messagesBox.scrollTop = messagesBox.scrollHeight;
});
