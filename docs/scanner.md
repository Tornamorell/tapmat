# Escáner

Estado: implementado y probado con imágenes de muestra. La primera prueba del usuario con el
móvil y cartas reales (2026-09-11) fue «bastante regular», y con eso se rehicieron la votación,
la búsqueda por título y la pantalla completa. **Falta volver a medirlo con cartas reales.**
Decisiones: D06 y D20 en `docs/decisions.md`.

## Cómo funciona

```
cámara trasera (getUserMedia, se piden 3840×2160; el móvil da lo que puede)
  → a pantalla completa, con el recuadro guía 63×88 entre la barra de arriba y el panel de abajo
  → el recuadro, pasado de coordenadas de pantalla a píxeles de vídeo      src/lib/scan/geometry.ts
    (object-fit: cover recorta el vídeo: coverTransform + toVideo)
  → «Buscar la carta» (D36): findCard() en todo lo que se ve, a 360 px    src/lib/scan/find-card.ts
    → si sale dos lecturas seguidas en el mismo sitio, se lee su caja en lugar del recuadro.
      La franja de datos va sobre la carta, como en el recuadro, o por debajo de ella (x 0–55 %,
      y 93–108 %) si lo encontrado es el marco de dentro: se prueban por turnos y se queda la que lee
  → 1. franja de datos (abajo a la izquierda: x 2–50 %, y 89,5–99 %), escalada a 140 px de alto,
       en gris con el contraste estirado → Tesseract (A–Z 0–9 / • ., PSM 11, texto disperso)
       → parseCollectorLine(): número, total, códigos, idioma           src/lib/scan/parse.ts
       → POST /api/scan/lookup → lookupScan()                           src/lib/queries/scan.ts
  → 2. si no hay línea de datos (una de cada dos lecturas): franja del título (x 4–76 %,
       y 2,5–10 %), 90 px → Tesseract (letras, PSM 7) → parseTitle()
       → POST /api/scan/name → lookupByName()
  → votación: la lectura tiene que salir 2 veces entre las últimas 6 (no hace falta que sean
    seguidas) y dar UNA carta → addItem(source: "scan") al destino de la sesión
```

- **Qué se lee de cada tipo de carta:**

  | Carta | Franja de datos | Si falla |
  | --- | --- | --- |
  | Magic 2023+ | `U 0001` / `MKM • EN`: código y número | Título |
  | Magic 2014–2022 | `001/280 C` / `M20 • EN`: código y número | Título |
  | Magic 2003–2013 | `146/249` junto al copyright, **ilegible** | **Título**. Con la expansión fija sale una sola carta. |
  | Pokémon Escarlata y Púrpura en adelante | `G [PAL EN] 001/193`: código (`sets.print_code`) o total | Título |
  | Pokémon Espada y Escudo y anteriores | `F 001/195`: total (`sets.printed_total`) y número | Título |
  | Pokémon promos Escarlata y Púrpura (SVP) | `G [SVP EN] 053 ★`: sin total, y «SVP EN» en blanco sobre negro. **Ilegible** | Título |
  | Full art / ilustraciones especiales | Texto blanco con contorno sobre la ilustración. En Pokémon, **ilegible** | Título; si no, IA o búsqueda manual |

- **Correcciones del OCR** en `parseCollectorLine`:
  - Letras en lugar de dígitos dentro de números (`0O1/I93` → `001/193`) y un símbolo pegado
    delante (`L001` → `001`).
  - Códigos pegados a un símbolo (`BPAL` → `PAL`) y O/0 intercambiadas (`M2O` → `M20`). Se prueban
    todas las variantes y el catálogo decide cuál existe.
- **Búsqueda por título** (`lookupByName`):
  - Similitud de trigramas contra los nombres en inglés y en español. Se prueba también el texto
    sin la primera palabra, porque el OCR suele meter ahí basura del marco o de la insignia de
    fase.
  - Se acepta un nombre si la similitud es alta (≥ 0,6), o si pasa de 0,45 y además supera a la
    segunda candidata en al menos 0,1. Así, "aerial ee" no se da por "Erial" (Wasteland en
    español, 0,45), que casi empata con cuatro cartas "Aerial …" (0,44).
  - En los empates gana el nombre más corto: la carta de la serie de arte "Lightning Bolt //
    Lightning Bolt" empata con "Lightning Bolt".
  - **Pokémon:** el «ex», «V», «GX» o «VMAX» del título es un logotipo que el OCR no lee
    («Mew ex» sale «BE Mew XA», que se parece más a «Mew»). Por eso un nombre de Pokémon trae
    también las cartas que se llaman igual más un sufijo (`Mew`, `Mew ex`, `Mew V`, `Mew-EX`…),
    las más recientes primero, y se elige por la imagen (`titleLogoSuffixes` en `games.ts`).
  - Devuelve las ediciones de esa carta. Sin expansión fija suelen ser varias y se elige por la
    imagen; con expansión fija, normalmente una.
- **Lecturas ambiguas:** si caben varias cartas, se muestran hasta 24 candidatas, las más
  recientes primero, para elegir por la imagen.
- **Añadir la misma carta dos veces:** tras añadir una, no se vuelve a añadir hasta que se lean 3
  fotogramas sin nada (la carta ha salido del encuadre) y, con «Buscar la carta», hasta que deje
  de encontrarse una carta en la imagen: una que se mueve o hace un reflejo no lee nada un
  momento, y se añadía dos veces. Si en ese caso se vuelve a leer, avisa «ya está añadida: si es
  otra copia, pulsa +». También si «Identificar con IA» da la carta que se acaba de añadir. Para
  otra copia está el **+**.
- **El idioma impreso** ("EN", "ES"…) manda sobre el idioma por defecto de la sesión.

## Pantalla (`/scan`)

- **Antes de empezar:**
  - Ubicación y colección, las dos opcionales (`EntryTarget`, D23). Sin ninguna, lo escaneado
    entra en Mis cartas sin ubicación.
  - Si la ubicación tiene separadores (D28), también el separador. En modo automático, cuando
    se llena, lo siguiente va al separador siguiente, con aviso y vibración para que pongas el
    separador físico. En la parte de arriba se ve «Caja 1 › 3 (87/100)», y en el panel de abajo
    está el botón «Siguiente separador».
  - Acabado, estado e idioma por defecto.
  - Expansión fija (opcional), con un buscador por nombre o código (`SetPicker`). Los álbumes
    de fútbol salen primero, y dentro de cada juego, las expansiones más recientes. También se
    entra con ella desde la página de la expansión: «Escanear esta expansión»,
    `/scan?set=mtg:m10`.
  - Botón **Foto**, para probar sin cámara.
  - La lista de la sesión, con «Añadir la sesión a una colección», y «¿No la reconoce? Búscala a
    mano», que abre el alta rápida.
- **Escaneando, a pantalla completa** (capa fija, con los márgenes de seguridad de iOS gracias a
  `viewportFit: cover`):
  - Como en ManaBox, la cámara ocupa toda la pantalla y los controles flotan sobre ella: nada le
    quita sitio al recuadro ni lo mueve.
  - **Arriba**, sobre la imagen: cerrar, destino (ubicación, colección y «solo XXX» si hay
    expansión fija) y el contador de la sesión.
  - **A la derecha**, una columna de botones:
    - linterna, si el móvil la ofrece en `getCapabilities().torch`;
    - «Identificar con IA»;
    - «Para luego», con las que hay por revisar;
    - ajustes: «Ajustar recuadro», «Buscar la carta» y «Ver lo que lee».
  - **En medio:** el recuadro guía, con la franja de datos marcada en amarillo y el estado de la
    lectura.
    - Va centrado en la pantalla, donde mira la cámara, y no cambia de tamaño ni de sitio. Antes
      el panel de abajo crecía y encogía con lo que enseñaba y lo movía; con un card slinger, que
      deja la carta siempre en el mismo sitio, eso lo desencajaba.
    - El recuadro ocupa el 94 % de la pantalla, menos una franja arriba y otra abajo para las
      barras flotantes.
    - **«Ajustar recuadro»**, en los ajustes de la derecha:
      - pausa la lectura y oculta las barras y la columna de botones; las instrucciones y
        «Listo» pasan arriba, por encima del recuadro;
      - el recuadro se arrastra con el dedo, y cualquiera de los círculos de sus cuatro esquinas
        le cambia el tamaño alrededor del centro, del 30 al 100 %, con la forma de una carta;
        así siempre queda alguno libre;
      - «Listo» guarda el tamaño y la posición en el dispositivo (`guideScale`, `guideDx`,
        `guideDy`), «Restablecer» vuelve al recuadro centrado y grande, y el recuadro nunca se
        sale de la pantalla (`placeGuide`);
      - la franja amarilla va con el recuadro.
    - Antes solo cambiaba el tamaño, con «Recuadro − +»,
      se hace más pequeño, hasta el 60 %, y el tamaño se recuerda en el dispositivo. Sirve para un
      card slinger, donde la carta se ve más pequeña y no se puede acercar: se ajusta una vez hasta
      que la carta llene el recuadro, para que la franja amarilla caiga en el número.
    - **«Buscar la carta»** (D36), activado por defecto en los ajustes: en cada lectura busca la
      carta en todo lo que se ve entre las barras (`findCard`, `src/lib/scan/find-card.ts`).
      - Cuando la encuentra dos lecturas seguidas en el mismo sitio, dibuja su contorno en verde,
        el recuadro pasa a segundo plano y se lee la carta encontrada en lugar del recuadro: el
        número, el título, la huella, «Para luego», la IA y la foto compartida.
      - La franja de datos puede estar en dos sitios (`FOUND_INFO_STRIPS`):
        - **sobre la carta**, donde la pone el recuadro, si se ha encontrado la carta entera (una
          mesa, un tapete, una pantalla);
        - **por debajo**, hasta un 8 % bajo lo encontrado, si solo se ha encontrado el marco de
          dentro: en un slinger, el borde negro no se distingue del fondo oscuro, y el número va
          impreso en ese borde.
      - Se prueban por turnos, y la primera que da una línea que está en el catálogo se queda
        para toda la sesión: la mesa o el slinger no cambian de una carta a otra. Si falla 4
        lecturas seguidas (`FOUND_STRIP_PROBE`), se mira una vez la otra (`pickFoundStrip`). La
        franja amarilla marca las dos hasta entonces, y después solo esa.
      - Si la pierde dos lecturas seguidas, vuelve al recuadro. Si tras tres lecturas no lee
        nada, una de cada dos es del recuadro, por si lo encontrado no era la carta.
      - Así el recuadro solo hace falta ajustarlo si no la encuentra.
  - **Abajo, flotando, la última carta añadida** en una línea: imagen, nombre, expansión, precio para su acabado y
    - **cantidad** −/+: `changeQuantity(-1)` o un `addItem` más. El número cambia al instante y
      vuelve atrás si falla;
    - **acabado** con un toque, que pasa al siguiente (Normal/Foil/Etched en Magic, Estándar/Reverse holo en
      Pokémon): `changeFinish()` mueve esas copias al montón con el acabado nuevo, fusionándolas
      si ya existe.
  - Si la lectura es ambigua, encima aparece la tira de candidatas.
  - **«Para luego»** (el reloj de la columna de la derecha, D25) guarda en la cola de revisión,
    sin parar la sesión:
    - una foto de la carta encontrada o, si no la hay, del recuadro (JPEG de 560 px de alto);
    - lo último que ha leído y el nombre que ha sacado del título, si lo hay;
    - los ajustes de la sesión.

    La cola se resuelve en `/review`, a la que se llega con el enlace «N por revisar» del
    escáner y de Mis cartas. Cada foto sale con la búsqueda rellenada con ese nombre, y la carta
    se añade con los ajustes guardados.
  - **Historial y total de la sesión:**
    - Arriba a la derecha, «12 · 34,50 €»: cartas y valor de la sesión, con el precio de cada
      acabado en el momento de leerla. Las copias sin precio se cuentan aparte.
    - Al tocarlo se abre el historial: hora, carta, expansión, acabado, valor y −/+. Mientras
      está abierto, la lectura se pausa.
    - La sesión se guarda en el dispositivo (`scan-session.ts`, localStorage), así que no se
      pierde si recargas, se bloquea el móvil o cierras la cámara.
    - Lo escaneado ya está en Mis cartas. Al acabar, en la página del escáner o al pie del
      historial, hay tres opciones:
      - **A una colección:** lista esas ediciones en una colección.
      - **A una ubicación:** mueve solo las copias de la sesión, no las que ya tenía un montón
        al que se sumó una lectura, a la ubicación y separador que elijas (`moveItems` con
        cantidades por montón).
      - **Terminar sesión:** pone el historial y el total a cero, y las cartas se quedan donde
        se añadieron. Se puede deshacer.
  - **Álbumes de fútbol** (D29):
    - Las Megacracks no llevan número por delante, y el nombre del jugador va en vertical, en
      blanco sobre una franja negra a la derecha.
    - Con el álbum como **expansión fija**, el escáner lee esa franja en lugar de la esquina,
      que es la zona marcada en amarillo: la gira, la pasa a grises e invierte los colores
      (`NAME_LAYOUTS` por línea de producto, en `src/lib/scan/geometry.ts`).
    - Busca el nombre solo en el álbum (`lookupInAlbum`) y ofrece todas las fichas del
      jugador (base, Élite, Power, Special One…), la más sencilla primero, para tocar la tuya.
      Solo se escanea por delante, que es también la foto compartida.
    - Medido con una base de 2025-26: «LAMINE YAMAL», con un 78 % de confianza. Falta
      probarlo con cartas reales de las series especiales, que pueden llevar el nombre en otro
      sitio.
  - **Foto compartida:** al añadir una carta sin imagen de catálogo (fútbol, algunas de
    Pokémon), el escáner guarda en segundo plano la foto del recuadro (300×419) como imagen de
    esa carta para todos, si aún no tiene ninguna (D30).
    - La carta se busca alrededor del recuadro, se endereza y se recorta a sus bordes, con los
      niveles ajustados (D32). Lo mismo con la foto de «Para luego» y la de «Identificar con
      IA». Si no encuentra los bordes, usa el recorte del recuadro.
  - **Reconocer por la foto** (D33):
    - Al empezar se descargan las huellas perceptuales de las fotos compartidas del álbum fijado,
      o de todas.
    - Una de cada tres lecturas endereza la carta del recuadro, calcula su huella (63 bits) y la
      compara en el propio dispositivo. Cuenta si está a 12 bits o menos y claramente más cerca
      que la siguiente, y la misma carta tiene que salir en 2 de las últimas 6 lecturas.
    - Así, una Élite o una Flashback se identifican con la IA la primera vez y, desde que tienen
      foto, se reconocen solas.
    - «Ver lo que lee» muestra «foto: a N bits» cuando reconoce una.
  - **Identificar con IA** (D31), en la columna de la derecha, solo si está configurada
    `ANTHROPIC_API_KEY`:
    - **Se sugiere sola cuando se atasca** (2026-09-15):
      - Si hay una carta a la vista («Buscar la carta») y nada la reconoce en 6 s (`STUCK_MS`),
        el botón se rodea de oro, late y al lado aparece «¿No la reconoce? Pruébala con la IA».
      - Sin IA, se ilumina «Para luego».
      - No llama a la IA por su cuenta, porque gastaría sin preguntar. En el mazo de 100
        cartas, el usuario tuvo que pensar en pulsarla en 5 cartas de marco especial.
      - El reloj vuelve a cero al añadir, al volver a leer la carta ya añadida, al pulsar la IA
        o «Para luego», y mientras hay candidatas en pantalla o ninguna carta a la vista.
    - Manda la foto del recuadro (JPEG de 560 px) a `POST /api/scan/identify`, que se la pasa a
      Claude Sonnet 5 y le pide un JSON con un formato cerrado (`src/lib/scan/identify.ts`):
      - en los álbumes de fútbol: nombre, equipo, número y serie, elegida de las series del
        álbum;
      - en el resto: nombre, número y código de expansión.
    - La respuesta se cruza con el catálogo (`lookupReading`). La IA nunca decide sola qué
      carta es:
      - en fútbol, las fichas del jugador en el álbum, con la serie que ha visto primero;
      - en Magic y Pokémon, la edición con ese número y ese nombre, o las ediciones de ese
        nombre.
    - Si sale una carta, se añade. Si salen varias, se elige, con la más probable primero.
    - La lectura se pausa mientras identifica.
    - Unos 3 s y 0,003 $ por carta. Cada llamada se apunta en `ai_identifications`, con un
      límite de 150 cada 24 horas (`AI_IDENTIFY_DAILY_LIMIT`).
    - Medido el 2026-09-12 con dos Megacracks (una base y una Élite Power): Sonnet 5 acertó el
      jugador y la serie en las dos; Haiku 4.5 y Opus 5 fallaron alguna serie.
  - «Ver lo que lee», en los ajustes, muestra la última franja procesada, el texto de Tesseract y
    cuánto ha tardado cada paso de la lectura: buscar la carta, la foto, el número, el título,
    el catálogo y añadirla («buscar 80 · número 420 ms»).
- **PWA:** manifest, iconos y `appleWebApp`. Añadida a la pantalla de inicio, se abre sin la barra
  del navegador. Aún no hay service worker.

## Requisitos

- **HTTPS** (o `localhost`), porque el navegador solo da la cámara en contextos seguros.
- Tesseract.js descarga su *worker*, su *core* (WASM) y el idioma `eng` desde jsDelivr la
  primera vez (unos MB).

## Mediciones (2026-09-11, escaneos de Scryfall y TCGdex)

**Franja de datos:**

| Muestra | Lectura | Resultado |
| --- | --- | --- |
| DMU 107 | `107/281 M ⏎ DMU EN CHRIS RAHN` | ✅ Sheoldred, the Apocalypse |
| MKM 1, WOE 1, ELD 1, M20 1 | Correctas | ✅ |
| Pokémon PAL 001 | `BPAL 001/193` | ✅ |
| Pokémon SIT 001 | `F 001/195` | ✅ por el total |
| Pokémon PBL 001 | `001/084` | ✅ |
| M10 146 (marco antiguo) | Ruido | ❌ |
| Pokémon 151 #199 (ilustración especial) | Ruido | ❌ |

Una franja de ancho completo (y 93,5–99 %) no mejoraba el conjunto y se descartó.

**Título** (resuelto con `lookupByName`, sin expansión fija):

| Muestra | OCR del título | Resultado |
| --- | --- | --- |
| ELD 1, WOE 1 | Correcto | ✅ |
| MKM 1 | `Case of he Shattered Pact` | ✅ |
| M10 146 | `fi Lightning Bolt` | ✅ Lightning Bolt (tras el desempate por longitud) |
| Pokémon Tropius, Hoppip, Venonat | `oastc, Tropius`, `and Hoppip`, `esd Venonat` | ✅ quitando la primera palabra |
| M20 1 | `Aerial EE` | Sin coincidencia, que es lo correcto: con el umbral antiguo daba Wasteland ("Erial") |
| DMU 107 | `I Shdlired ic gncaljiie` | ❌ (el número sí se lee) |
| Pokémon 151 #199 | `BES Charizard GX` | ⚠️ da Charizard GX, que es otra carta |

## Mediciones (2026-09-14, Pokémon promos, full art y ex)

Con imágenes de TCGdex (600×825), las mismas que se ven en una pantalla. La prueba del usuario
fue escanear desde la pantalla del ordenador una Mew ex promo (SVP 053), y no la reconocía.

**Franja de datos:** en las cartas normales se leen el número y el total (`001/195`,
`230/198`), pero nunca el código de expansión. En las promos SVP y las full art no sale nada útil:

| Muestra | Lectura | Resultado |
| --- | --- | --- |
| SVP 053 Mew ex, SVP 100 Grafaiai ex | Ruido | ❌ |
| SVP 001 Sprigatito | `BZ 001` | ❌ (sin total ni código) |
| 151 #199, 151 #205, SIT 186 (full art) | `1991658`, `20571658 3`, ruido | ❌ |

Se probaron varias variantes, y ninguna lee «SVP EN» ni el número de las full art:
- una franja más estrecha (x 2–38 %, y 93–99 %), que además lee mal alguna normal (`001/198`
  por `001/195`);
- la franja invertida o binarizada (Otsu);
- PSM 7 y 11;
- un recorte ajustado a la línea.

En Magic la franja de siempre lee igual de bien, así que se dejó como estaba.

**Título:** el nombre sí se lee, pero el sufijo no:

| Muestra | OCR del título | Antes | Ahora (familia del nombre) |
| --- | --- | --- | --- |
| Mew ex (SVP 053, 151 #151) | `BE Mew XA`, `Mew ZX A` | 24 Mew, ninguna Mew ex | Mew ex, Mew V, Mew…; la SVP 053 es la 6.ª. Con la SVP fija, solo ella |
| Charizard ex 151 #199 | `al Charizard X AS` | Charizard | La #199 es la 6.ª. Con la 151 fija, sus tres Charizard ex |
| Pikachu ex SSP 238 | `Pikachu gw` | Pikachu | La 11.ª. Con la SSP fija, sus cuatro Pikachu ex |
| Grafaiai ex SVP 100, Great Tusk ex SVI 230 | `ll GrafaiaiX`, `ap- Great Tuskg` | Solo la base | También la ex |
| Magic: Lightning Bolt, MKM 1, `Aerial EE` | | | Sin cambios |

## Mediciones (2026-09-14, franja de una carta encontrada entera)

En el móvil, con la Mew ex en la pantalla del ordenador, se encontraba la carta entera, pero la
franja amarilla quedaba casi toda por debajo de ella, sobre la pantalla: estaba pensada para el
marco de dentro del slinger.

Se simuló con las 20 muestras de arriba, con un margen oscuro del 3 % alrededor de cada una, como
la caja algo holgada que da `findCard`:

- **La franja de debajo** (y 93–108 % de la caja) no lee el número de **ninguna**. Empieza por
  debajo de él y solo coge `DMU EN` y el artista.
- **La franja sobre la carta** (la del recuadro) lo lee en las 7 de Magic (`107/281 M` +
  `DMU EN`, `U 0001` + `MKM EN`…) y en varias Pokémon normales (`001/165`, `001/191`,
  `001/195`, `230/198`).

Por eso se prueban las dos. El slinger no se pudo volver a medir, porque sus fotos no se
guardaron: su franja sigue siendo la misma.

Con el cambio, en el móvil, «Ver lo que lee» enseñaba la franja buena (`G SVP EN 053 ☆` y el
copyright), pero Tesseract no sacaba nada. La franja ya cae en su sitio; lo que no se puede es
leer ese pie.

## Mediciones (2026-09-14, un mazo de Commander de 100 cartas)

El usuario escaneó un mazo entero a su caja, con cartas reales y «Buscar la carta». Salió
«bastante bien», pero algo lento y a veces duplicando la carta.

- **Ritmo:** entraron 89 montones (los básicos se juntan). Entre una carta nueva y la siguiente:
  - mediana de 5,9 s, y 58 de 89 en menos de 8 s;
  - 26 tardaron más de 8 s, y 4 más de un minuto: las que fueron a la IA o costaron.
- **Con IA, 5 cartas:**
  - dos con marco especial y el número sobre la ilustración: Skullspore Nexus LCI 340 y Etali
    MOM 298;
  - Worldly Tutor, sin número ni código en la lectura;
  - Garruk's Uprising FDN 220.
- **Etali se identificó dos veces con IA en 11 s**, y cada vez se añadía: la IA no miraba si era
  la carta recién añadida. Al final del mazo solo sobraba una Mountain; los demás duplicados se
  quitaron con «−» sobre la marcha, así que no se pueden contar.
- **Dos causas en el código:**
  - La franja de una carta encontrada se olvidaba al sacar cada carta, así que la siguiente
    empezaba alternando y la mitad de sus lecturas eran con la franja que no toca.
  - Una carta se soltaba tras 3 lecturas sin nada aunque siguiera a la vista.

  Arreglado el mismo día (franja para toda la sesión, no soltar la carta mientras se vea, la IA
  no repite), y el tiempo de cada paso en «Ver lo que lee». **Falta volver a medir.**

## Mediciones (2026-09-16, por qué no leía cartas normales)

El usuario no conseguía escanear cartas corrientes: «me da la sensación que quiere leer
demasiado rápido». **No era el ritmo.** Con su foto de una Cultivate (NCC 285) se pasó la lectura
real paso a paso (`findCard` → franjas → OCR → `parseCollectorLine`):

- `findCard` la encuentra bien, en 45 ms, y lo que encuentra es el marco de dentro (76 % del
  ancho de la foto), así que la franja que toca es la de debajo.
- La franja cae en su sitio: en el recorte se lee `285 C` / `NCC • EN ✎ ANTHONY PALUMBO`. Lo que
  fallaba era el OCR: con PSM 6 salía `10 S ⏎ 2 C ⏎ RE EN ANTHONY PALUMBO`.
- **La causa es la segmentación.** El nombre del artista va en su propia columna, al lado del
  número, y PSM 6 (un bloque uniforme) junta las dos columnas en la misma línea. Con **PSM 11**
  (texto disperso) las separa: `285` y `NCC EN …`.

**Regresión con 15 cartas** (imágenes de catálogo con la caja metida un 4 % hacia dentro, para
simular el marco que se encuentra en un slinger), puntuando contra el propio catálogo:

| Franja | Número | Código | Las dos |
| --- | --- | --- | --- |
| La de hoy, PSM 6 | 12 | 8 | 8 |
| **La de hoy, PSM 11** | **14** | **9** | **9** |
| Más estrecha (x 0–40 %, y 97,5–107,5 %), PSM 6 | 11 | 7 | 6 |
| Más estrecha, PSM 11 | 7 | 2 | 2 |

- PSM 11 no pierde ninguna carta y gana MOM 298 (`null` → `0298 MOM`). Además corrige dos
  lecturas *equivocadas* de PSM 6: SV09 001, que leía `901`, y ME01 001, donde leía el código
  `ELD` —una expansión que existe— en una carta MEG.
- Y es **más rápido**: 34 ms frente a 56 ms en la misma franja de 140 px.
- **Descartada la franja más estrecha.** Leía la foto de la Cultivate, pero estaba ajustada a esa
  foto: en el conjunto se queda en 6 de 15, porque en muchos marcos se come la fila del número y
  solo deja `FDN EN ARTISTA`. En M20 1 llegaba a leer el número mal (`200` por `001`).
- Lo de siempre: M10 146 (marco antiguo) sigue sin leerse por la franja; se resuelve por título.

**Dos errores del código, encontrados por el camino:**

- `numberVariants(n)[1]` se usaba como «el número normalizado», pero es `undefined` cuando el
  número no lleva ceros delante (`"107"` → `["107"]`). La clave de la votación
  (`c:<número>/<total>/<código>`) quedaba en `c:undefined//NCC`, **igual para dos cartas
  distintas de la misma expansión**: dos lecturas de cartas diferentes se votaban entre sí. Ahora
  hay `canonicalNumber()` en `parse.ts`, con tests. Era una causa de las lecturas duplicadas y
  equivocadas al escanear un mazo entero.
- `captureRegion` no recortaba la franja al borde del fotograma. La de debajo se sale por abajo
  cuando la carta queda baja en la pantalla, y lo que cae fuera el canvas lo pinta de negro
  transparente: ese negro falso hundía el mínimo del estirado de contraste y deslavaba el texto.
  Ahora se recorta a lo que existe.

### Con la app ya desplegada (2026-09-16, dos capturas del móvil)

Con el cambio en producción, el usuario mandó dos capturas escaneando cartas dentro de una caja.
Dicen dos cosas:

- **La lectura sí funciona:** en la Cultivate el estado ponía «Leyendo NCC 285 EN…», o sea número,
  expansión e idioma correctos. Pero la carta no se añadía.
- **La franja amarilla caía sobre el texto de ambientación**, no sobre el número.

Lo primero tenía una causa clara. Sobre la foto real, la franja da `285` + `WCC` (una letra mal en
`NCC`), y `lookupScan` exigía que el código existiera: con un código que no existe y sin total,
devolvía cero candidatas. **La carta se leía bien y se tiraba.** Por eso ahora, como último
recurso —después del código exacto y del total impreso—, vale un código de la misma longitud que
se diferencie en una sola posición. El número sigue teniendo que cuadrar, así que no puede
inventarse una carta; si encajan varias, se eligen a mano, como siempre.

Medido de punta a punta con las mismas 15 cartas (franja → `parseCollectorLine` → `lookupScan`):
**14 de 15 se resuelven**, 13 como única o primera candidata. La única que no, M10 146, es el
marco antiguo de siempre, que se resuelve por título.

- **Descartada otra vez la franja única** que cubre las dos posiciones (x 0–55 %, y 89,5–108 %).
  Se volvió a probar ahora que PSM 11 separa bloques, que era la pega de 2026-09-14: se queda en
  8 de 15 (frente a 9), no lee nada en la foto real y tarda 131–259 ms en vez de 34–44.
- **Cuidado con las mediciones simuladas:** la caja que usan (la imagen del catálogo metida un
  4 %) **contiene** la línea del número, mientras que la caja real de `findCard` a menudo acaba
  **por encima** de ella. Las dos franjas no caen igual en un sitio y en otro, así que esas tablas
  miden el catálogo, no el móvil.

**Cuál de las dos franjas se elige en el móvil** quedó en duda: en esas capturas la amarilla estaba
sobre el texto de ambientación, en la foto real la buena es la de debajo (la línea cae a
y 100–107,5 % de la caja) y en la captura de pantalla la buena es la de encima. La grabación de
abajo lo aclara en parte: allí la franja **está bien puesta**.

### La grabación con «Ver lo que lee» (2026-09-16)

3,4 s leyendo una Sheltered Thicket (AKH 248/269) dentro de una caja. **La franja está bien
puesta**: el recuadro amarillo cae sobre la línea y la miniatura del panel enseña `248/269 R` /
`AKH • EN ✎ SUNG CHOI` perfectamente legibles. Lo que falla es la lectura.

Cinco lecturas distintas en esos 3,4 s, unos 680 ms cada una:

| Lecturas | Texto de Tesseract | `parseCollectorLine` |
| --- | --- | --- |
| 1–3 | `269 R ⏎ 4 ⏎ H EN SUNG CHOI` | **null**: `H` no llega a código y `269` no lleva barra |
| 4 | `248/269 R ⏎ 4 ⏎ KH EN SUNG CHOI` | 248/269, sin código |
| 5 | `48/269 R ⏎ Y AKH EN SUNG CHOI` | 48/269, código AKH |

- **Tres de cinco lecturas no dan nada**, y las otras dos no coinciden: la clave de la votación
  cambia cada vez y **nunca llega a 2 de 6, así que la carta no se añade nunca.** Eso es lo que se
  ve como «la lee y no hace nada».
- Se pierden los **primeros caracteres de las dos líneas**: `248`→`48`→nada, y `AKH`→`KH`→`H`.
- **Tiempos**, del propio panel: `buscar` 118–130 ms, `número` 90–150, `título` 43–83 y `foto`
  101–197 una de cada tres. De ahí los ~680 ms por lectura, y no los 250 de `TICK_MS`.

**Dos hipótesis probadas y descartadas:**

- **Un margen a la izquierda** de la franja, por si el borde se comiera el primer carácter: en las
  15 cartas no mejora (9 de 15 con −2 % y 8 con −4 %, frente a 9). No se toca.
- **La luz desigual** (sombra a la izquierda, brillo a la derecha) contra el estirado de contraste
  global. Sobre la foto real se compararon el de hoy, por bandas (4, 8 y 16), CLAHE (32 y 64),
  `normalise` y `sharpen`: **todas leen `WCC`**, ninguna recupera `NCC`; y a 220 px todas empeoran
  y pierden el código entero. El código mal leído **no es un problema de luz**, es Tesseract
  confundiendo la letra. Eso respalda el recurso del código a una letra de distancia: si no se
  puede leer mejor, hay que tolerarlo.

**Sigue abierto:** por qué se pierden los primeros caracteres en el móvil. No se puede reproducir
con lo que hay —las imágenes del catálogo están bien iluminadas y no fallan así, la foto real falla
por sustitución (`N`→`W`) y no por pérdida, y los fotogramas del vídeo (384×848) no tienen
resolución para volver a pasarles el OCR—. Haría falta **una foto fija del móvil, en la misma caja
y con la misma luz, de una carta que no se lee.**

## Parámetros de ajuste

En `scanner.tsx`:
- `INFO_HEIGHT` (140) y `TITLE_HEIGHT` (90).
- `TICK_MS` (250).
- `VOTES_NEEDED` (2) de `VOTE_WINDOW` (6).
- `EMPTY_READS_TO_RELEASE` (3).
- `STUCK_MS` (6000): cuánto tiempo sin reconocer una carta a la vista antes de sugerir la IA.

En `geometry.ts`:
- `INFO_STRIP` y `TITLE_STRIP`.
- El relleno del recuadro guía, `GUIDE_FILL` (0,94), con el tamaño y la posición que elija cada
  uno (del 30 al 100 %, `GUIDE_SCALE_MIN`; `guideScale`, `guideDx` y `guideDy` en los valores
  recordados del dispositivo).
- `FOUND_INFO_STRIPS`: las dos franjas de datos de una carta encontrada, entera o solo su
  marco (D36), y `FOUND_STRIP_PROBE` (4): cada cuántas lecturas seguidas sin línea se mira la
  otra.

En `find-card.ts` (D36): cuántas rectas se prueban (`LINES`, 30), la inclinación máxima
(`MAX_SLOPE`, ±14°), el tamaño mínimo (`MIN_AREA`, 6 % de la imagen), la tolerancia de forma
(`RATIO_TOLERANCE`, `RATIO_SIGMA`, `PARALLEL_SIGMA`), cuánto cuenta que una recta siga más allá
de las esquinas (`EXT_WEIGHT`) y hasta dónde se empuja cada lado hacia fuera (`REACH`, 5 %).

En `queries/scan.ts`:
- `NAME_SIMILARITY_SURE` (0,6).
- `NAME_SIMILARITY_MIN` (0,45).
- `NAME_MARGIN` (0,1).

## Pendiente

- **Volver a medir con el móvil y cartas reales.** «Ver lo que lee» enseña lo que falla. En
  particular, la mejora de PSM 11 está medida sobre imágenes de catálogo simuladas y sobre una
  sola foto real: falta confirmarla con el slinger y con cartas en la mano.
- Recordar el acabado elegido en el panel para las siguientes cartas, si el uso lo pide. Hoy
  cambia solo la carta actual; el valor por defecto se fija antes de empezar.
- **Cola de revisión** con miniatura (`pending_scans`), si la búsqueda manual se queda corta.
- **Service worker** (Serwist), para uso sin conexión.
- **Probar «Buscar la carta» (D36) en el móvil:** cuánto tarda por fotograma y si confunde el
  hueco del card slinger con la carta.
- **Promos y full art de Pokémon sin IA:** la franja de datos no se lee (mediciones del
  2026-09-14) y el título da varias candidatas.
  - Se probó la huella de D33 contra las imágenes del catálogo (2026-09-14): dos capturas del
    móvil con la Mew ex SVP 053 en la pantalla del ordenador, frente a 644 imágenes de TCGdex
    (SVP, 151 y Paldean Fates).
  - La Mew quedó a 14 y 20 bits, y otras cartas a 16–18, así que `bestMatch` la rechaza. En
    fotos tan borrosas, `detectCardQuad` tampoco endereza del todo la carta.
  - La imagen del catálogo emborronada sí se encuentra: a 6 bits, con la siguiente a 18.
  - Haría falta una huella más fina o fotos más nítidas. Queda por decidir.
