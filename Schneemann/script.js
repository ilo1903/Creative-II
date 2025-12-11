
// Canvas auswählen
const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d');


// Start
resizeCanvas();

// Canvas-Größe anpassen
function resizeCanvas() {
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
  draw();
}

// Schneemann zeichnen
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const cx = canvas.width / 2;   // Mitte X
  const cy = canvas.height / 2;  // Mitte Y

  // Radien der drei Kugeln
  const r1 = canvas.width * 0.12;   // unten
  const r2 = r1 * 0.7;              // mitte
  const r3 = r1 * 0.45;             // oben

  // Positionen
  const y1 = cy + r1;                 // untere Kugel
  const y2 = y1 - r1 - r2 + 5;        // mittlere Kugel
  const y3 = y2 - r2 - r3 + 5;        // Kopf

  // Weiße Körperkugeln
  drawCircle(cx, y1, r1, '#ffffff');
  drawCircle(cx, y2, r2, '#ffffff');
  drawCircle(cx, y3, r3, '#ffffff');

  // Augen
  const eyeR = r3 * 0.15;
  drawCircle(cx - r3 * 0.4, y3 - r3 * 0.15, eyeR, '#000000');
  drawCircle(cx + r3 * 0.4, y3 - r3 * 0.15, eyeR, '#000000');

  // Karotten-Nase
  ctx.beginPath();
  ctx.fillStyle = 'orange';
  ctx.moveTo(cx, y3);
  ctx.lineTo(cx + r3 * 1.5, y3 + r3 * 0.1);
  ctx.lineTo(cx, y3 + r3 * 0.2);
  ctx.fill();
}

// Hilfsfunktion: Kreise malen
function drawCircle(x, y, r, color) {
  ctx.beginPath();
  ctx.fillStyle = color;
  ctx.arc(x, y, r, 0, Math.PI * 2);    //*2 kompletter Kreis (360°)
  ctx.fill();  // Füllt den gezeichneten Kreis komplett mit Weiß.
}


