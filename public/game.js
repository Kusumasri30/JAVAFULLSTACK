const canvas = document.querySelector("#game");
const context = canvas.getContext("2d");
const elements = {
  distance: document.querySelector("#distance"), fuel: document.querySelector("#fuel-fill"),
  coins: document.querySelector("#coins"), start: document.querySelector("#start-overlay"),
  end: document.querySelector("#end-overlay"), state: document.querySelector("#game-state"),
  board: document.querySelector("#leaderboard"), summary: document.querySelector("#end-summary"),
  toast: document.querySelector("#toast"),
};
const keys = new Set();
const heldControls = new Set();
const pickups = new Map();
let width = 0;
let height = 0;
let pixelRatio = 1;
let mode = "ready";
let lastFrame = 0;
let player;
let cameraX = 0;
let cameraBottom = 0;
let audioContext;
let soundOn = true;
let toastTimer;
const seed = Math.floor(Math.random() * 9000) + 1000;
document.querySelector("#trail-seed").textContent = seed;

function groundAt(x) {
  return 25 + Math.sin(x * 0.0075 + seed) * 35
    + Math.sin(x * 0.016 + seed * 0.3) * 15
    + Math.sin(x * 0.0028 + seed * 0.8) * 42;
}

function slopeAt(x) {
  return Math.atan((groundAt(x + 3) - groundAt(x - 3)) / 6);
}

function resetPlayer() {
  player = { x: 70, y: groundAt(70) + 18, vx: 0, vy: 0, angle: slopeAt(70), spin: 0, fuel: 100, coins: 0, grounded: true };
  cameraX = 0;
  cameraBottom = player.y - height * 0.26;
  elements.distance.textContent = "000";
  elements.coins.textContent = "0";
  elements.fuel.style.width = "100%";
  elements.fuel.style.backgroundColor = "#547c43";
}

function resizeCanvas() {
  const bounds = canvas.getBoundingClientRect();
  pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  width = bounds.width;
  height = bounds.height;
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  if (player) cameraBottom = player.y - height * 0.26;
}

new ResizeObserver(resizeCanvas).observe(canvas);
window.addEventListener("resize", resizeCanvas);
resetPlayer();
resizeCanvas();

function isDown(...names) {
  return names.some((name) => keys.has(name) || heldControls.has(name));
}

function startRun() {
  if (mode === "running") return;
  resetPlayer();
  mode = "running";
  elements.start.classList.add("hidden");
  elements.end.classList.add("hidden");
  elements.state.textContent = "OUT ON THE TRAIL";
  lastFrame = performance.now();
  document.querySelector("#rider-name").value = "";
}

function finishRun(reason) {
  if (mode !== "running") return;
  mode = "ended";
  elements.state.textContent = reason === "fuel" ? "OUT OF FUEL" : "TAKE A BREATHER";
  elements.summary.textContent = `${Math.floor(player.x / 10)} m travelled  ·  ${player.coins} coins found`;
  elements.end.querySelector(".overlay-kicker").textContent = reason === "fuel" ? "TANK RUN DRY" : "A LITTLE TOO MUCH AIR";
  elements.end.classList.remove("hidden");
  document.querySelector("#rider-name").focus({ preventScroll: true });
}

function update(dt) {
  if (mode !== "running") return;
  const throttle = isDown(" ", "arrowup", "w", "throttle");
  const brake = isDown("arrowdown", "s", "brake");
  const lean = Number(isDown("d", "arrowright", "lean-right")) - Number(isDown("a", "arrowleft", "lean-left"));
  if (throttle && player.fuel > 0) player.vx += 175 * dt;
  if (brake) player.vx -= 250 * dt;
  player.vx *= Math.pow(player.fuel > 0 && throttle ? 0.997 : 0.986, dt * 60);
  player.vx = Math.max(-70, Math.min(310, player.vx));
  if (player.fuel > 0) player.fuel = Math.max(0, player.fuel - dt * (1.1 + (throttle ? 1.5 : 0)));
  player.x = Math.max(0, player.x + player.vx * dt);
  const floor = groundAt(player.x) + 18;
  if (player.y <= floor) {
    player.y = floor;
    player.vy = 0;
    player.grounded = true;
    const targetAngle = slopeAt(player.x) + lean * 0.27;
    player.angle += (targetAngle - player.angle) * Math.min(1, dt * 7);
    player.spin *= Math.pow(0.08, dt);
  } else {
    player.grounded = false;
    player.vy -= 430 * dt;
    player.y += player.vy * dt;
    player.spin += lean * 2.7 * dt;
    player.spin *= Math.pow(0.42, dt);
    player.angle += player.spin * dt;
  }
  if (Math.abs(player.angle) > 2.12 || player.y < groundAt(player.x) - 60) {
    finishRun("flip");
    return;
  }

  const pickupIndex = Math.floor(player.x / 270);
  for (let index = Math.max(0, pickupIndex - 1); index <= pickupIndex + 1; index++) {
    const item = pickupAt(index);
    if (item.taken || Math.abs(player.x - item.x) > 30 || Math.abs(player.y - item.y) > 68) continue;
    item.taken = true;
    if (item.type === "fuel") {
      player.fuel = Math.min(100, player.fuel + 39);
      showToast("FUEL TOP-UP +39");
    } else {
      player.coins += 1;
      showToast("NICE FIND +1");
    }
    playTone(item.type === "fuel" ? 480 : 740);
  }
  elements.distance.textContent = String(Math.floor(player.x / 10)).padStart(3, "0");
  elements.coins.textContent = player.coins;
  elements.fuel.style.width = `${player.fuel}%`;
  elements.fuel.style.backgroundColor = player.fuel < 25 ? "#e27657" : "#547c43";
  cameraX += (Math.max(0, player.x - width * 0.25) - cameraX) * Math.min(1, dt * 4);
  cameraBottom += (player.y - height * 0.26 - cameraBottom) * Math.min(1, dt * 2.5);
  if (player.fuel === 0 && player.vx < 5) finishRun("fuel");
}

function pickupAt(index) {
  if (!pickups.has(index)) {
    const x = 175 + index * 270;
    pickups.set(index, { x, y: groundAt(x) + 78, type: index % 4 === 3 ? "fuel" : "coin", taken: false });
  }
  return pickups.get(index);
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elements.toast.classList.remove("visible"), 900);
}

function playTone(frequency) {
  if (!soundOn) return;
  try {
    audioContext ??= new AudioContext();
    const oscillator = audioContext.createOscillator();
    const volume = audioContext.createGain();
    oscillator.frequency.value = frequency;
    oscillator.type = "sine";
    volume.gain.setValueAtTime(0.06, audioContext.currentTime);
    volume.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.12);
    oscillator.connect(volume);
    volume.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.12);
  } catch {
    soundOn = false;
  }
}

function draw() {
  const sky = context.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#abd2c6");
  sky.addColorStop(1, "#e4e4c9");
  context.fillStyle = sky;
  context.fillRect(0, 0, width, height);
  drawSun();
  drawClouds();
  drawHills();
  drawTerrain();
  drawPickups();
  drawTrailMarkers();
  drawCar();
}

function drawSun() {
  context.fillStyle = "rgba(255,242,186,.7)";
  context.beginPath(); context.arc(width * 0.78, height * 0.2, 32, 0, Math.PI * 2); context.fill();
}

function drawClouds() {
  for (let index = 0; index < 4; index++) {
    const drift = (cameraX * 0.08 + index * 197) % (width + 100) - 50;
    const x = width - drift;
    const y = height * (0.16 + (index % 2) * 0.09);
    context.fillStyle = "rgba(249,248,228,.53)";
    context.beginPath();
    context.ellipse(x, y, 25, 7, 0, 0, Math.PI * 2);
    context.ellipse(x - 15, y + 2, 12, 5, 0, 0, Math.PI * 2);
    context.ellipse(x + 14, y + 1, 14, 5, 0, 0, Math.PI * 2);
    context.fill();
  }
}

function drawHills() {
  const palettes = [
    { color: "#a4c9ae", base: 0.62, amp: 19, freq: 0.006, factor: 0.2 },
    { color: "#8eb398", base: 0.72, amp: 24, freq: 0.008, factor: 0.42 },
  ];
  for (const layer of palettes) {
    context.beginPath();
    context.moveTo(0, height);
    for (let x = 0; x <= width + 8; x += 8) {
      const worldX = x + cameraX * layer.factor;
      const y = height * layer.base + Math.sin(worldX * layer.freq + seed) * layer.amp
        + Math.sin(worldX * layer.freq * 0.57) * layer.amp * 0.6;
      context.lineTo(x, y);
    }
    context.lineTo(width, height);
    context.closePath();
    context.fillStyle = layer.color;
    context.fill();
  }
}

function terrainScreenY(worldX) {
  return height + cameraBottom - groundAt(worldX);
}

function drawTerrain() {
  context.beginPath();
  context.moveTo(0, height);
  for (let x = -8; x <= width + 8; x += 7) context.lineTo(x, terrainScreenY(cameraX + x));
  context.lineTo(width, height);
  context.closePath();
  context.fillStyle = "#769151";
  context.fill();
  context.beginPath();
  for (let x = -8; x <= width + 8; x += 7) {
    const y = terrainScreenY(cameraX + x);
    if (x === -8) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.strokeStyle = "#a4b96a";
  context.lineWidth = 4;
  context.stroke();
  context.beginPath();
  for (let x = -8; x <= width + 8; x += 11) {
    const y = terrainScreenY(cameraX + x);
    if (x === -8) context.moveTo(x, y + 14);
    else context.lineTo(x, y + 14);
  }
  context.strokeStyle = "rgba(206,184,119,.4)";
  context.lineWidth = 9;
  context.stroke();
}

function drawTree(x, baseY, scale = 1) {
  context.save(); context.translate(x, baseY); context.scale(scale, scale);
  context.fillStyle = "#6b5237"; context.fillRect(-2, -27, 4, 30);
  context.fillStyle = "#527659";
  for (let branch = 0; branch < 3; branch++) {
    context.beginPath(); context.moveTo(0, -48 + branch * 10);
    context.lineTo(-12 + branch * 2, -24 + branch * 10);
    context.lineTo(12 - branch * 2, -24 + branch * 10); context.closePath(); context.fill();
  }
  context.restore();
}

function drawTrailMarkers() {
  const first = Math.floor(cameraX / 430);
  for (let index = first; index < first + Math.ceil(width / 430) + 2; index++) {
    const x = 120 + index * 430;
    const screenX = x - cameraX;
    if (screenX > -20 && screenX < width + 20) drawTree(screenX, terrainScreenY(x) + 1, index % 2 === 0 ? 0.85 : 0.65);
  }
}

function drawPickups() {
  const start = Math.max(0, Math.floor(cameraX / 270) - 1);
  const end = Math.floor((cameraX + width) / 270) + 1;
  for (let index = start; index <= end; index++) {
    const item = pickupAt(index);
    if (item.taken) continue;
    const x = item.x - cameraX;
    const y = height + cameraBottom - item.y;
    if (item.type === "fuel") drawFuelCan(x, y);
    else drawCoin(x, y);
  }
}

function drawCoin(x, y) {
  context.fillStyle = "rgba(239,179,71,.23)";
  context.beginPath(); context.arc(x, y, 14, 0, Math.PI * 2); context.fill();
  context.fillStyle = "#e8a842"; context.beginPath(); context.arc(x, y, 9, 0, Math.PI * 2); context.fill();
  context.strokeStyle = "#fff0b8"; context.lineWidth = 2;
  context.beginPath(); context.arc(x, y, 5, 0, Math.PI * 2); context.stroke();
}

function drawFuelCan(x, y) {
  context.save(); context.translate(x, y); context.fillStyle = "#e8795a";
  context.fillRect(-9, -11, 18, 22); context.fillRect(3, -15, 7, 5);
  context.strokeStyle = "#f9e2ba"; context.lineWidth = 2; context.strokeRect(-5, -6, 10, 12);
  context.restore();
}

function drawCar() {
  const screenX = player.x - cameraX;
  const screenY = height + cameraBottom - player.y;
  context.save(); context.translate(screenX, screenY); context.rotate(-player.angle);
  context.fillStyle = "rgba(38,61,43,.18)";
  context.beginPath(); context.ellipse(0, 19, 31, 5, 0, 0, Math.PI * 2); context.fill();
  for (const wheelX of [-20, 20]) {
    context.fillStyle = "#26352d"; context.beginPath(); context.arc(wheelX, 10, 9, 0, Math.PI * 2); context.fill();
    context.fillStyle = "#d7d6c5"; context.beginPath(); context.arc(wheelX, 10, 4, 0, Math.PI * 2); context.fill();
    context.strokeStyle = "#87927d"; context.lineWidth = 1;
    context.beginPath(); context.moveTo(wheelX - 3, 10); context.lineTo(wheelX + 3, 10); context.stroke();
  }
  context.fillStyle = "#e87455"; context.beginPath(); context.moveTo(-31, 1); context.lineTo(-28, -9);
  context.lineTo(-15, -11); context.lineTo(-7, -22); context.lineTo(10, -22); context.lineTo(20, -10);
  context.lineTo(29, -7); context.lineTo(32, 2); context.lineTo(28, 6); context.lineTo(-27, 6); context.closePath(); context.fill();
  context.fillStyle = "#f49b72"; context.beginPath(); context.moveTo(-9, -19); context.lineTo(7, -19);
  context.lineTo(16, -10); context.lineTo(-15, -10); context.closePath(); context.fill();
  context.fillStyle = "#f4db81"; context.fillRect(25, -5, 5, 4);
  context.fillStyle = "#41654b"; context.fillRect(-26, -8, 5, 3);
  context.fillStyle = "#335f44"; context.fillRect(-12, 5, 24, 4);
  context.restore();
}

function frame(now) {
  const dt = Math.min((now - (lastFrame || now)) / 1000, 0.035);
  lastFrame = now;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) event.preventDefault();
  keys.add(key);
  if (mode === "ready" && [" ", "arrowup", "w"].includes(key)) startRun();
  if (key === "escape" && mode === "running") {
    mode = "paused";
    elements.state.textContent = "PAUSED · PRESS ESC TO ROLL";
  } else if (key === "escape" && mode === "paused") {
    mode = "running";
    lastFrame = performance.now();
    elements.state.textContent = "OUT ON THE TRAIL";
  }
});
window.addEventListener("keyup", (event) => keys.delete(event.key.toLowerCase()));
window.addEventListener("blur", () => {
  keys.clear(); heldControls.clear();
  if (mode === "running") { mode = "paused"; elements.state.textContent = "PAUSED · PRESS ESC TO ROLL"; }
});
document.querySelector("#start-button").addEventListener("click", startRun);
document.querySelector("#replay-button").addEventListener("click", startRun);
document.querySelector("#sound-toggle").addEventListener("click", (event) => {
  soundOn = !soundOn;
  event.currentTarget.textContent = soundOn ? "♫" : "♪";
  event.currentTarget.setAttribute("aria-label", soundOn ? "Mute sound" : "Enable sound");
});

for (const button of document.querySelectorAll("[data-control]")) {
  const control = button.dataset.control;
  const down = (event) => {
    event.preventDefault(); heldControls.add(control);
    button.setPointerCapture?.(event.pointerId);
    if (mode === "ready" && control === "throttle") startRun();
  };
  const up = () => heldControls.delete(control);
  button.addEventListener("pointerdown", down);
  button.addEventListener("pointerup", up);
  button.addEventListener("pointercancel", up);
  button.addEventListener("lostpointercapture", up);
}

document.querySelector("#score-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button[type=submit]");
  button.disabled = true;
  const form = new URLSearchParams({
    name: document.querySelector("#rider-name").value.trim() || "Rider",
    distance: String(Math.floor(player.x / 10)),
    coins: String(player.coins),
  });
  try {
    const response = await fetch("/api/score", { method: "POST", body: form });
    if (!response.ok) throw new Error("Score could not be saved");
    renderBoard((await response.json()).scores);
    elements.end.classList.add("hidden");
    elements.start.classList.remove("hidden");
    elements.start.querySelector(".overlay-kicker").textContent = "RUN SAVED / READY FOR MORE?";
    elements.start.querySelector("h2").innerHTML = "That was<br>a good one.";
    elements.start.querySelector("#start-button").innerHTML = 'Ride again <span>↗</span>';
    mode = "ready";
    elements.state.textContent = "READY WHEN YOU ARE";
  } catch {
    showToast("COULDN'T SAVE · TRY AGAIN");
  } finally {
    button.disabled = false;
  }
});

function renderBoard(scores) {
  elements.board.replaceChildren();
  if (!scores.length) {
    const empty = document.createElement("li");
    empty.className = "empty-board";
    empty.textContent = "No rides yet. Make the first one.";
    elements.board.append(empty);
    return;
  }
  scores.forEach((score, index) => {
    const row = document.createElement("li");
    const rank = document.createElement("span"); rank.className = "rank";
    rank.textContent = String(index + 1).padStart(2, "0");
    const name = document.createElement("span"); name.className = "rider"; name.textContent = score.name;
    const distance = document.createElement("span"); distance.className = "score"; distance.textContent = `${score.distance} m`;
    row.append(rank, name, distance);
    elements.board.append(row);
  });
}

fetch("/api/leaderboard").then((response) => response.json()).then((data) => renderBoard(data.scores)).catch(() => {});