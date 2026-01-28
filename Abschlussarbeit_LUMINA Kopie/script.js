/* =============================================================================
   1) DOM-ELEMENTE HOLEN + CANVAS INITIALISIEREN
   ============================================================================= */

// Canvas ist die Zeichenfläche für die Partikel-Animation.
const canvas = document.getElementById('canvas');
// "ctx" (context) ist das 2D-Zeichenwerkzeug, mit dem wir Kreise etc. zeichnen.
const ctx = canvas.getContext('2d');

// UI-Kasten (damit wir verhindern können, dass Klicks auf UI Feuerwerk auslösen).
const ui = document.getElementById('ui');

// Inputs: Farbe und Größe
const colorPicker = document.getElementById('color');
const sizeSlider = document.getElementById('size');

// Anzeige-Elemente (Client-ID / Fehlermeldung)
const indexElem = document.getElementById('client-index');
const messageElem = document.getElementById('message-display');

// Canvas einmalig setzen und bei Fensteränderung anpassen.
resize();
window.addEventListener('resize', resize);

/**
 * Passt Canvas an die aktuelle Bildschirmgröße an.
 * Warum? Wenn Canvas nicht exakt so groß wie der Viewport ist,
 * stimmen Koordinaten und Darstellung nicht.
 */
function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}


/* =============================================================================
   2) WEBSOCKET / WEBROOMS KONFIGURATION
   ============================================================================= */

/**
 * Das ist der WebSocket-Server von "Web Rooms".
 * Über diesen Server können sich Clients in einem Raum treffen
 * und Nachrichten (z.B. "Explosion bei x,y") austauschen.
 */
const webRoomsWebSocketServerAddr = 'wss://nosch.uber.space/web-rooms/';

/**
 * Raumname für euer gemeinsames Projekt.
 * (Keine Leerzeichen -> mit Bindestrich)
 */
const ROOM_NAME = 'feuerwerk-ilona';


/* =============================================================================
   3) SOUND: WAV LADEN UND ABSPIELEN (WEB AUDIO API, kein <audio>)
   ============================================================================= */

/**
 * Web Audio API "AudioContext":
 * - Der AudioContext ist die zentrale Audio-Engine im Browser.
 * - Er ist am Anfang oft "suspended" (gesperrt) wegen Autoplay-Policy.
 */
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

/**
 * Hier wird später die dekodierte WAV-Datei gespeichert.
 * "AudioBuffer" ist das fertige, abgespielbare Audiodatenobjekt.
 */
let explosionBuffer = null;

/**
 * Lädt die WAV-Datei per fetch, liest sie als ArrayBuffer und dekodiert sie.
 * Danach liegt sie als AudioBuffer in explosionBuffer.
 */
async function loadSound() {
  try {
    // WAV vom Server holen (Pfad relativ zu index.html)
    const response = await fetch('sounds/explosion.wav');

    // Wenn Datei nicht gefunden wird, wirft fetch nicht automatisch einen Fehler,
    // daher prüfen wir das "ok" Flag.
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} beim Laden von sounds/explosion.wav`);
    }

    // Rohdaten (Bytes) in einen ArrayBuffer lesen
    const arrayBuffer = await response.arrayBuffer();

    // Bytes -> AudioBuffer dekodieren (PCM etc.)
    explosionBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  } catch (err) {
    console.warn('Sound konnte nicht geladen werden:', err);
    setError('Sound fehlt oder Pfad falsch: sounds/explosion.wav');
  }
}

// Sound beim Start laden (asynchron)
loadSound();

/**
 * Spielt den Explosionssound ab.
 * - Kein Fade (wie du es wolltest)
 * - Maximale Dauer ~2 Sekunden (stop nach 2s)
 * - Lautstärke optional größenabhängig (kannst du auch fix auf 1 setzen)
 */
function playExplosionSound(size = 30) {
  // Wenn Sound noch nicht geladen ist, können wir nichts abspielen
  if (!explosionBuffer) return;

  // Falls AudioContext gesperrt ist, versuchen wir ihn zu aktivieren
  // (Geht nur, wenn schon eine User-Interaktion stattgefunden hat)
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  // BufferSource ist ein "Abspielkopf" für den AudioBuffer
  const source = audioCtx.createBufferSource();
  source.buffer = explosionBuffer;

  // GainNode steuert Lautstärke
  const gain = audioCtx.createGain();

  // Optional: Lautstärke über Größe skaliert (10..60 => ~0.16..1.0)
  // Wenn du IMMER gleich laut willst: gain.gain.value = 1;
  gain.gain.value = Math.min(size / 60, 1);

  // Verkabelung: source -> gain -> Lautsprecher
  source.connect(gain);
  gain.connect(audioCtx.destination);

  // Start sofort
  source.start();

  // Hart nach 2 Sekunden stoppen (falls WAV länger ist)
  // Wenn WAV exakt 2 Sekunden ist, passt das perfekt.
  source.stop(audioCtx.currentTime + 2);
}

/**
 * Audio "entsperren":
 * - Viele Browser erlauben Audio erst nach Click/Touch/Keypress.
 * - Das hier sorgt dafür, dass der erste User-Input den AudioContext aktiviert.
 * - Danach wird der Listener automatisch entfernt.
 */
function unlockAudioOnce() {
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  window.removeEventListener('pointerdown', unlockAudioOnce);
  window.removeEventListener('touchstart', unlockAudioOnce);
  window.removeEventListener('keydown', unlockAudioOnce);
}
window.addEventListener('pointerdown', unlockAudioOnce, { once: true });
window.addEventListener('touchstart', unlockAudioOnce, { once: true });
window.addEventListener('keydown', unlockAudioOnce, { once: true });


/* =============================================================================
   4) MULTIUSER-STATUS (CLIENT-ID, POINTER, ACTIVE ROCKETS, EXPLOSIONS)
   ============================================================================= */

/**
 * clientId: wird vom WebRoom-Server vergeben (wir addieren +1 wie in eurer Vorlage)
 * clientCount: wie viele Clients aktuell verbunden sind
 */
let clientId = null;
let clientCount = 0;

/**
 * pointerId:
 * - Wir erlauben pro Client nur eine aktive "Geste" (ein Finger/Mausklick).
 * - pointerId merkt sich, welcher Pointer gerade aktiv ist.
 */
let pointerId = null;

/**
 * explosions:
 * - Array von Explosionen
 * - Jede Explosion ist ein Array aus Partikeln
 * - In der Animation updaten & zeichnen wir alle Partikel.
 */
const explosions = [];

/**
 * activeRockets:
 * - Map<clientId, rocket>
 * - rocket enthält die Infos, die wir im Raum teilen:
 *   { x (0..1), y (0..1), color, size }
 *
 * Warum normalisierte Koordinaten (0..1)?
 * - Damit verschiedene Bildschirmgrößen trotzdem konsistent sind.
 * - Beim Zeichnen multiplizieren wir wieder mit canvas.width/height.
 */
const activeRockets = new Map();


/* =============================================================================
   5) PARTIKEL-SYSTEM (runde Explosion)
   ============================================================================= */

/**
 * Particle repräsentiert ein einzelnes Teilchen in der Explosion.
 * - Startposition (x,y) in Pixel
 * - Geschwindigkeit (vx,vy) in Pixel pro Frame
 * - Größe (size)
 * - Farbe (color)
 * - Lebensdauer (life) in Frames
 */
class Particle {
  constructor(x, y, color, size, angle) {
    // speed bestimmt, wie schnell das Partikel vom Zentrum wegfliegt
    const speed = Math.random() * 4 + 2; // 2..6

    this.x = x;
    this.y = y;

    // Für runde Explosion: wir berechnen vx/vy aus Winkel
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;

    this.size = size;   // Partikelradius
    this.color = color; // Partikelfarbe

    // life = Anzahl Frames, in denen das Partikel sichtbar bleibt
    this.life = 60;
  }

  /**
   * Update pro Frame:
   * - Position bewegen
   * - Partikel kleiner machen
   * - Lebensdauer verringern
   */
  update() {
    this.x += this.vx;
    this.y += this.vy;

    // schrumpfen -> wirkt natürlicher
    this.size *= 0.96;

    this.life--;
  }

  /**
   * Zeichnen:
   * - globalAlpha abhängig von life => Partikel wird transparenter
   * - Kreis (arc) füllen
   */
  draw() {
    ctx.globalAlpha = this.life / 60;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

/**
 * Erzeugt eine Explosion an (x,y) in Pixelkoordinaten.
 * - count Partikel gleichmäßig auf 360° verteilt => sauber runde Explosion
 */
function createExplosion(x, y, color, size) {
  const count = 80; // Anzahl Partikel pro Explosion

  const particles = [];
  for (let i = 0; i < count; i++) {
    // Winkel gleichmäßig verteilen
    const angle = (Math.PI * 2 / count) * i;

    // Partikelgröße relativ zur eingestellten Größe
    particles.push(new Particle(x, y, color, size / 4, angle));
  }

  // Explosion hinzufügen (wird in animate() verarbeitet)
  explosions.push(particles);
}


/* =============================================================================
   6) POINTER EVENTS: EIGENE INTERAKTION
   ============================================================================= */

/**
 * Wichtig: Wenn du am UI-Kasten (Slider/Farbe) rumspielst,
 * soll NICHT im Hintergrund Feuerwerk starten.
 *
 * Lösung:
 * - Im pointerdown prüfen: ui.contains(e.target) -> dann return.
 */
document.body.addEventListener('pointerdown', (e) => {
  // ✅ Klick/Touch im UI-Kasten? -> Kein Feuerwerk!
  if (ui && ui.contains(e.target)) return;

  // Wenn schon ein Pointer aktiv ist oder wir noch keine clientId haben -> nichts tun
  if (pointerId !== null || clientId === null) return;

  pointerId = e.pointerId;

  // Normierte Koordinaten (0..1)
  const rocket = {
    x: e.clientX / canvas.width,
    y: e.clientY / canvas.height,
    color: colorPicker.value,
    size: Number(sizeSlider.value),
  };

  // Rakete lokal merken (für unseren clientId)
  activeRockets.set(clientId, rocket);

  // Und an alle anderen broadcasten:
  // selector "start" + id + rocket
  send('*broadcast-message*', ['start', clientId, rocket]);
});

/**
 * pointerup: wenn wir loslassen -> Explosion auslösen
 */
document.body.addEventListener('pointerup', (e) => {
  // Nur reagieren, wenn es unser aktiver Pointer ist
  if (e.pointerId !== pointerId) return;

  const rocket = activeRockets.get(clientId);

  if (rocket) {
    // Normierte Koordinaten zurück in Pixel umrechnen
    createExplosion(
      rocket.x * canvas.width,
      rocket.y * canvas.height,
      rocket.color,
      rocket.size
    );

    // Sound lokal abspielen
    playExplosionSound(rocket.size);

    // eigene Rakete entfernen
    activeRockets.delete(clientId);
  }

  // Broadcast: "end" (damit andere Clients auch explodieren lassen)
  send('*broadcast-message*', ['end', clientId]);

  pointerId = null;
});

/**
 * Optional extra-sicher: UI-Events stoppen, damit sie nicht nach "unten" durchgehen.
 * Das ist redundant zur ui.contains(...) Prüfung, aber verhindert edge cases.
 */
ui?.addEventListener('pointerdown', (e) => e.stopPropagation());
ui?.addEventListener('pointermove', (e) => e.stopPropagation());
ui?.addEventListener('pointerup', (e) => e.stopPropagation());


/* =============================================================================
   7) ANIMATION LOOP: ZEICHNEN + UPDATE
   ============================================================================= */

/**
 * animate() läuft ~60fps über requestAnimationFrame.
 * Wir:
 * 1) malen einen halbtransparenten schwarzen Layer drüber (Nachzieheffekt)
 * 2) updaten/zeichnen alle Partikel
 * 3) entfernen tote Partikel/Explosionen
 */
function animate() {
  // "Trail" Effekt: nicht komplett löschen, sondern mit Alpha übermalen
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Von hinten nach vorne iterieren, damit splice sicher ist
  for (let i = explosions.length - 1; i >= 0; i--) {
    const particles = explosions[i];

    for (let j = particles.length - 1; j >= 0; j--) {
      const p = particles[j];

      p.update();
      p.draw();

      // Wenn life abgelaufen ist (oder sehr klein), Partikel löschen
      if (p.life <= 0 || p.size < 0.2) {
        particles.splice(j, 1);
      }
    }

    // Wenn Explosion keine Partikel mehr hat -> Explosion entfernen
    if (particles.length === 0) {
      explosions.splice(i, 1);
    }
  }

  requestAnimationFrame(animate);
}
animate();


/* =============================================================================
   8) WEBSOCKET: VERBINDEN + ROOM BETRETEN + MESSAGES VERARBEITEN
   ============================================================================= */

let socket;

try {
  socket = new WebSocket(webRoomsWebSocketServerAddr);
} catch (e) {
  setError('Konnte WebSocket nicht öffnen');
  console.error(e);
}

if (socket) {
  socket.addEventListener('open', () => {
    // In den Raum eintreten
    send('*enter-room*', ROOM_NAME);

    // Anzahl Clients abonnieren (Server schickt regelmäßig *client-count*)
    send('*subscribe-client-count*');

    // Keepalive: manche Server schließen inaktive Verbindungen -> alle 30s leere Nachricht
    setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send('');
      }
    }, 30000);
  });

  socket.addEventListener('close', () => {
    clientId = null;
    setError('Verbindung zum Server getrennt');
  });

  socket.addEventListener('error', () => {
    setError('WebSocket-Fehler');
  });

  socket.addEventListener('message', (e) => {
    // Server sendet manchmal leere Nachrichten (keepalive)
    if (!e.data) return;

    const msg = JSON.parse(e.data);
    const selector = msg[0];

    switch (selector) {
      /**
       * Server sagt uns: "deine client-id ist X"
       * In eurer Vorlage: +1, damit IDs bei 1 starten.
       */
      case '*client-id*': {
        clientId = msg[1] + 1;
        indexElem.innerText = `#${clientId}/${clientCount}`;
        break;
      }

      /**
       * Server sagt: "aktuell sind N clients verbunden"
       */
      case '*client-count*': {
        clientCount = msg[1];
        indexElem.innerText = `#${clientId}/${clientCount}`;
        break;
      }

      /**
       * start: Ein anderer Client hat pointerdown gemacht.
       * Er sendet uns seine Rocket-Daten (x,y,color,size).
       *
       * Wir speichern sie in activeRockets, damit wir beim "end"
       * wissen, wo und wie groß/farbig explodiert wird.
       */
      case 'start': {
        const id = msg[1];
        const rocket = msg[2];

        // eigene Nachrichten ignorieren (die haben wir lokal schon)
        if (id !== clientId) {
          activeRockets.set(id, rocket);
        }
        break;
      }

      /**
       * end: Ein anderer Client hat pointerup gemacht.
       * Dann lösen wir bei uns die Explosion aus (visuell + sound).
       */
      case 'end': {
        const id = msg[1];

        // eigene end ignorieren (haben wir schon lokal gemacht)
        if (id === clientId) break;

        const rocket = activeRockets.get(id);
        if (rocket) {
          createExplosion(
            rocket.x * canvas.width,
            rocket.y * canvas.height,
            rocket.color,
            rocket.size
          );

          // Sound für andere Clients:
          // funktioniert erst, nachdem dieser Browser einmal "entsperrt" wurde.
          playExplosionSound(rocket.size);

          activeRockets.delete(id);
        }
        break;
      }

      /**
       * Wenn der Server mal einen Fehler sendet (je nach WebRooms)
       */
      case '*error*': {
        console.warn('Server error:', msg);
        setError('Server-Fehler (siehe Konsole)');
        break;
      }

      default:
        // Unbekannte Nachricht -> ignorieren
        break;
    }
  });
}


/* =============================================================================
   9) HILFSFUNKTIONEN
   ============================================================================= */

/**
 * Sendet eine Nachricht über den WebSocket, wenn die Verbindung offen ist.
 * Wir senden JSON-String (weil WebRooms JSON-Arrays erwartet).
 *
 * Beispiel:
 * send('*broadcast-message*', ['start', clientId, rocket])
 */
function send(...msg) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(msg));
  }
}

/**
 * Zeigt eine Fehlermeldung im UI an.
 */
function setError(text) {
  if (messageElem) messageElem.innerText = text;
}
