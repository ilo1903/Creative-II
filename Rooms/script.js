/*************************************************************
 * 1. Ich hole mir alle wichtigen HTML-Elemente
 *************************************************************/

// Ich suche im HTML das Element mit der ID "title-display" und merke es mir
const titleElem = document.getElementById('title-display');

// Ich suche das Element für Nachrichten/Fehlertexte
const messageElem = document.getElementById('message-display');

// Ich suche das Element, in dem ich meine Spieler-Nummer anzeigen werde
const indexElem = document.getElementById('client-index');

// Ich hole mir das Canvas-Element, also meine Zeichenfläche
const canvas = document.getElementById('canvas');

// Ich hole mir den 2D-Zeichenstift, damit ich auf das Canvas malen kann
const context = canvas.getContext('2d');

// Ich speichere die Adresse des WebRooms-Servers, mit dem ich reden will
const webRoomsWebSocketServerAddr = 'wss://nosch.uber.space/web-rooms/';

// Ich lege fest, wie groß ein Kreis am Anfang ist
const startRadius = 10;

// Ich lege fest, um wie viel der Kreis pro Animations-Frame wächst
const growthPerFrame = 0.7;

// Ich weiß meine Client-ID noch nicht, deshalb ist sie am Anfang null
let clientId = null;

// Ich zähle, wie viele Clients insgesamt verbunden sind
let clientCount = 0;

// Ich schreibe einen Titel in meine Infobox
titleElem.innerText = 'Touch Touch – Circles';

// Am Anfang ist noch keine Meldung da
messageElem.innerText = '';

// Wenn die Fenstergröße sich ändert, rufe ich meine Funktion zum Anpassen des Canvas auf
window.addEventListener('resize', updateCanvasSize);


/*************************************************************
 * 2. Ich definiere, wie ein aktiver Kreis (Touch) funktioniert
 *************************************************************/

// Ich erstelle eine Schablone (Klasse) für einen Kreis, der noch wächst
class Touch {

  // Diese Funktion wird aufgerufen, wenn ich einen neuen Touch erstelle
  constructor(id, x, y, own = false) {

    // Ich speichere die ID des Spielers, dem dieser Kreis gehört
    this.id = id;

    // Ich speichere die X-Position relativ zum Bildschirm (0 = links, 1 = rechts)
    this.x = x;

    // Ich speichere die Y-Position relativ zum Bildschirm (0 = oben, 1 = unten)
    this.y = y;

    // Ich merke mir, ob der Kreis mir gehört oder einem anderen Spieler
    this.own = own;

    // Ich starte mit einem festen Anfangsradius
    this.radius = startRadius;
  }

  // Diese Funktion verschiebt den Kreis an eine neue Position
  move(x, y) {
    this.x = x;   // Ich merke mir die neue X-Position
    this.y = y;   // Ich merke mir die neue Y-Position
  }

  // Diese Funktion lässt den Kreis größer werden
  grow() {
    this.radius += growthPerFrame;  // Ich addiere jedes Mal etwas zum Radius
  }
}


/*************************************************************
 * 3. Ich speichere aktive Touches und fertige Kreise
 *************************************************************/

// Ich erstelle eine Map für alle aktiven (wachsenden) Kreise
const touches = new Map();

// Ich erstelle ein Array für alle fertigen Kreise, die stehen bleiben
const circles = [];


/*************************************************************
 * 4. Ich starte alles, sobald ich meine Client-ID habe
 *************************************************************/
function start() {

  // Ich passe das Canvas sofort an die Fenstergröße an
  updateCanvasSize();

  // Ich höre darauf, wenn jemand drückt
  document.body.addEventListener('pointerdown', onPointerDown);

  // Ich höre darauf, wenn jemand den Finger oder die Maus bewegt
  document.body.addEventListener('pointermove', onPointerMove);

  // Ich höre darauf, wenn jemand loslässt
  document.body.addEventListener('pointerup', onPointerUp);

  // Ich behandle Abbrüche so wie Loslassen
  document.body.addEventListener('pointercancel', onPointerUp);

  // Ich starte meine Zeichen-Animation
  requestAnimationFrame(onAnimationFrame);
}


/*************************************************************
 * 5. Ich reagiere auf Pointer-Eingaben
 *************************************************************/

// Ich merke mir, welcher Pointer zu mir gehört
let pointerId = null;


// Diese Funktion wird aufgerufen, wenn ich drücke
function onPointerDown(e) {

  // Ich erlaube nur einen Kreis gleichzeitig
  if (pointerId === null && clientId !== null) {

    // Ich speichere die ID dieses Zeigegeräts
    pointerId = e.pointerId;

    // Ich rechne Pixel-Koordinaten in relative Werte (0..1) um
    const x = e.clientX / canvas.width;
    const y = e.clientY / canvas.height;

    // Ich erstelle meinen eigenen wachsenden Kreis
    createTouch(clientId, x, y, true);

    // Ich sage allen anderen Spielern: „Ich habe angefangen zu drücken“
    sendRequest('*broadcast-message*', ['start', clientId, x, y]);
  }
}


// Diese Funktion wird aufgerufen, wenn ich meinen Finger bewege
function onPointerMove(e) {

  // Ich überprüfe, ob das mein eigener Pointer ist
  if (e.pointerId === pointerId) {

    // Ich rechne wieder in relative Koordinaten um
    const x = e.clientX / canvas.width;
    const y = e.clientY / canvas.height;

    // Ich bewege meinen Touch-Kreis
    moveTouch(clientId, x, y);

    // Ich informiere alle anderen über die Bewegung
    sendRequest('*broadcast-message*', ['move', clientId, x, y]);
  }
}


// Diese Funktion wird aufgerufen, wenn ich loslasse
function onPointerUp(e) {

  // Ich prüfe, ob das Loslassen zu meinem Pointer gehört
  if (e.pointerId === pointerId) {

    // Ich hole meinen Touch-Eintrag
    const touch = touches.get(clientId);

    // Wenn es meinen Kreis gibt…
    if (touch) {

      // …mache ich daraus einen fertigen Kreis
      circles.push({
        id: touch.id,
        x: touch.x,
        y: touch.y,
        radius: touch.radius,
        own: true
      });

      // Ich lösche den aktiven wachsenden Kreis
      deleteTouch(clientId);
    }

    // Ich sage allen anderen Spielern: „Ich bin fertig“
    sendRequest('*broadcast-message*', ['end', clientId]);

    // Ich habe keinen aktiven Pointer mehr
    pointerId = null;
  }
}


/*************************************************************
 * 6. Ich verwalte Touch-Objekte
 *************************************************************/

// Ich erstelle einen neuen Touch-Kreis
function createTouch(id, x, y, own = false) {
  const touch = new Touch(id, x, y, own); // Ich baue ein neues Touch-Objekt
  touches.set(id, touch);                 // Ich speichere es in der Map
}

// Ich bewege einen existierenden Touch-Kreis
function moveTouch(id, x, y) {
  const touch = touches.get(id); // Ich suche den Touch
  if (touch) touch.move(x, y);   // Wenn er existiert, bewege ich ihn
}

// Ich lösche einen Touch-Kreis aus der Map
function deleteTouch(id) {
  touches.delete(id);            // Ich entferne den Eintrag
}


/*************************************************************
 * 7. Ich zeichne alles ins Canvas
 *************************************************************/

// Ich passe die Größe des Canvas an das Fenster an
function updateCanvasSize() {
  canvas.width = window.innerWidth;   // Ich setze die Breite
  canvas.height = window.innerHeight; // Ich setze die Höhe
}

// Diese Funktion wird immer wieder vom Browser aufgerufen
function onAnimationFrame() {

  // Ich lösche die ganze Zeichenfläche
  context.clearRect(0, 0, canvas.width, canvas.height);

  // Ich zeichne zuerst alle fertigen Kreise
  for (const circle of circles) {

    // Ich rechne relative Positionen in Pixel um
    const x = canvas.width * circle.x;
    const y = canvas.height * circle.y;

    // Ich male den fertigen Kreis
    drawCircle(context, x, y, circle.radius, circle.own);
  }

  // Ich bearbeite jetzt alle aktiven Touch-Kreise
  for (const [, touch] of touches) {

    // Ich lasse sie größer werden
    touch.grow();

    // Ich rechne wieder die Position um
    const x = canvas.width * touch.x;
    const y = canvas.height * touch.y;

    // Ich male den wachsenden Kreis
    drawCircle(context, x, y, touch.radius, touch.own);
  }

  // Ich bitte den Browser, mich beim nächsten Frame wieder aufzurufen
  requestAnimationFrame(onAnimationFrame);
}


// Ich male einen Kreis auf das Canvas
function drawCircle(context, x, y, radius, highlight = false) {

  // Wenn der Kreis mir gehört, male ich ihn rötlicher
  context.globalAlpha = highlight ? 0.666 : 0.5;

  // Meine eigenen Kreise sind rot, fremde weiß
  context.fillStyle = highlight ? '#f00' : '#fff';

  // Ich beginne eine neue Zeichenform (Kreis)
  context.beginPath();

  // Ich definiere den Kreis mathematisch
  context.arc(x, y, radius, 0, 2 * Math.PI);

  // Ich fülle den Kreis
  context.fill();

  // Ich setze die Deckkraft wieder auf normal
  context.globalAlpha = 1;

  // Ich zeichne einen dünnen schwarzen Rand
  context.strokeStyle = '#000';
  context.lineWidth = 1;
  context.stroke();
}


/*************************************************************
 * 8. Ich verbinde mich mit dem WebRooms-Server
 *************************************************************/

// Ich baue eine WebSocket-Verbindung auf
let socket = new WebSocket(webRoomsWebSocketServerAddr);

// Wenn die Verbindung erfolgreich aufgebaut wurde…
socket.addEventListener('open', () => {

  // Ich trete in einen Raum ein, der "touch-touch" heißt
  sendRequest('*enter-room*', 'touch-touch');

  // Ich abonniere die Anzahl der verbundenen Clients
  sendRequest('*subscribe-client-count*');
});


// Ich höre auf jede Nachricht, die vom Server kommt
socket.addEventListener('message', (event) => {

  // Ich verwandle den JSON-Text in ein echtes JavaScript-Objekt
  const incoming = JSON.parse(event.data);

  // Ich speichere die Art der Nachricht (erster Listeneintrag)
  const type = incoming[0];

  // Ich entscheide, was ich basierend auf der Nachricht mache
  switch (type) {

    // Der Server sagt mir meine Client-Nummer
    case '*client-id*':
      clientId = incoming[1] + 1;  // Ich erhöhe sie wie im Beispiel
      start();                     // Ich starte dann das Programm
      break;

    // Der Server schickt mir die Anzahl der Clients
    case '*client-count*':
      clientCount = incoming[1];   // Ich speichere sie
      indexElem.textContent = `#${clientId}/${clientCount}`; // Ich zeige sie an
      break;

    // Ein anderer Spieler hat angefangen zu drücken
    case 'start': {
      const id = incoming[1];  // Ich lese die ID des anderen
      const x = incoming[2];   // Ich lese X
      const y = incoming[3];   // Ich lese Y
      if (id !== clientId)     // Ich male es nur, wenn es nicht meiner ist
        createTouch(id, x, y, false);
      break;
    }

    // Ein anderer bewegt seine Berührung
    case 'move': {
      const id = incoming[1];
      const x = incoming[2];
      const y = incoming[3];
      if (id !== clientId)
        moveTouch(id, x, y);
      break;
    }

    // Ein anderer hört auf zu drücken
    case 'end': {
      const id = incoming[1];
      const touch = touches.get(id);
      if (touch) {
        circles.push({
          id,
          x: touch.x,
          y: touch.y,
          radius: touch.radius,
          own: false
        });
        deleteTouch(id);
      }
    }
  }
});


/*************************************************************
 * 9. Ich habe eine Hilfsfunktion zum Senden
 *************************************************************/

// Ich verpacke jede Nachricht als JSON und schicke sie zum Server
function sendRequest(...msg) {
  socket.send(JSON.stringify(msg));
}
