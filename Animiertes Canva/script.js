// Ich hole mir das Papier (das Canvas)
const canvas = document.getElementById('canvas');

// Ich hole mir den Stift zum Malen
const context = canvas.getContext('2d');

// Meine Kreise fangen klein an
const startRadius = 10;

// So schnell lasse ich die Kreise wachsen
const growthPerFrame = 0.7;


// Wenn das Fenster größer wird, mache ich auch mein Papier größer
window.addEventListener('resize', updateCanvasSize);

// Ich stelle das Papier gleich am Anfang richtig ein
updateCanvasSize();


// Ich höre darauf, wenn ich drücke, bewege oder loslasse
document.body.addEventListener('pointerdown', onPointerDown);
document.body.addEventListener('pointermove', onPointerMove);
document.body.addEventListener('pointerup', onPointerUp);
document.body.addEventListener('pointercancel', onPointerUp);


// Hier starte ich meine Animation. Ich male immer wieder neu.
requestAnimationFrame(onAnimationFrame);


/*************************************************************
 * Hier merke ich mir meine Kreise
 *************************************************************/

// Hier speichere ich alle Kreise, die fertig sind und stehen bleiben
const circles = [];

// Hier speichere ich Kreise, die ich gerade halte und wachsen lasse
const pointers = new Map();


/*************************************************************
 * Ich mache eine zufällige Farbe, aber nicht weiß oder zu hell
 *************************************************************/
function randomColor() {
  let r, g, b;

  do {
    // Ich würfle mir eine Farbe zusammen
    r = Math.floor(Math.random() * 256);
    g = Math.floor(Math.random() * 256);
    b = Math.floor(Math.random() * 256);

    // Wenn die Farbe zu hell ist, probiere ich es nochmal
  } while (r + g + b > 700);

  // Ich gebe die Farbe zurück
  return `rgb(${r}, ${g}, ${b})`;
}


/*************************************************************
 * Wenn ich drücke, beginne ich einen neuen Kreis
 *************************************************************/
function onPointerDown(e) {

  // Ich starte einen kleinen Kreis an der Stelle, wo ich drücke
  const pointer = {
    x: e.clientX,
    y: e.clientY,
    radius: startRadius,
    color: randomColor() // Ich gebe dem Kreis eine bunte Farbe
  };

  // Ich merke mir diesen Kreis, solange ich gedrückt halte
  pointers.set(e.pointerId, pointer);
}


/*************************************************************
 * Wenn ich den Finger oder die Maus bewege
 *************************************************************/
function onPointerMove(e) {

  // Ich hole mir den Kreis, den ich gerade halte
  const pointer = pointers.get(e.pointerId);

  if (pointer) {
    // Ich bewege den Kreis mit meiner Bewegung mit
    pointer.x = e.clientX;
    pointer.y = e.clientY;
  }
}


/*************************************************************
 * Wenn ich loslasse
 *************************************************************/
function onPointerUp(e) {

  // Ich hole mir den Kreis, den ich gerade hatte
  const pointer = pointers.get(e.pointerId);

  if (pointer) {

    // Ich speichere den Kreis als fertig. Er bleibt stehen.
    circles.push({
      x: pointer.x,
      y: pointer.y,
      radius: pointer.radius,
      color: pointer.color
    });

    // Ich lasse den Kreis los. Er wächst nicht mehr.
    pointers.delete(e.pointerId);
  }
}


/*************************************************************
 * Ich mache mein Papier so groß wie das Fenster
 *************************************************************/
function updateCanvasSize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}


/*************************************************************
 * Ich male das Bild immer wieder neu
 *************************************************************/
function onAnimationFrame() {

  // Ich wische erst alles weg. Der Hintergrund bleibt weiß.
  context.clearRect(0, 0, canvas.width, canvas.height);

  // Zuerst male ich alle Kreise, die schon fertig sind
  for (const circle of circles) {
    context.fillStyle = circle.color;
    context.beginPath();
    context.arc(circle.x, circle.y, circle.radius, 0, 2 * Math.PI);
    context.fill();
  }

  // Dann male ich die Kreise, die ich gerade wachsen lasse
  for (let [id, pointer] of pointers) {

    // Ich lasse den Kreis weiter wachsen, solange ich drücke
    pointer.radius += growthPerFrame;

    context.fillStyle = pointer.color;
    context.beginPath();
    context.arc(pointer.x, pointer.y, pointer.radius, 0, 2 * Math.PI);
    context.fill();
  }

  // Ich sage dem Computer, dass er gleich wieder malen soll
  requestAnimationFrame(onAnimationFrame);
}
