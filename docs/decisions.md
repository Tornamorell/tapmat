# Registro de decisiones

**Todas las decisiones son provisionales.** Se tomaron con lo que se sabía en ese momento y se
revisan cuando aparezca una necesidad que no encaje. Si vas a contradecir una, no la ignores:
cámbiala aquí, explica por qué y marca la anterior como sustituida.

Formato de cada entrada: contexto, decisión, alternativas descartadas y cuándo revisarla.
Estados posibles: `provisional`, `sustituida por Dnn` o `descartada`.

---

## D01 · Empezar por Magic, con un modelo genérico — 2026-09-11 · provisional

- **Contexto:** la app debe cubrir Magic, Pokémon, fútbol y otros juegos. Magic es el que tiene
  mejores datos abiertos (Scryfall).
- **Decisión:** el MVP es solo de Magic, pero el esquema lleva `game` desde el principio y lo
  propio de cada juego vive en `src/lib/games.ts`.
- **Revisar cuando:** se integre el segundo juego. Si su modelo (acabados, rarezas, idiomas)
  no encaja, habrá que ampliar el esquema.

## D02 · Precio de referencia: Cardmarket en € vía Scryfall — 2026-09-11 · provisional

- **Contexto:** el usuario está en España; Cardmarket es el mercado europeo de referencia. La API
  de Cardmarket está cerrada a apps nuevas.
- **Decisión:** se usan `prices.eur` y `prices.eur_foil` del bulk de Scryfall. En USD solo se
  guarda como dato informativo.
- **Descartado:** TCGplayer (USD, API cerrada a desarrolladores nuevos) y scraping de Cardmarket.
- **Revisar cuando:** hagan falta precios por estado o idioma, o Scryfall deje de dar precios en €.

## D03 · Web y móvil con una sola app Next.js (PWA) — 2026-09-11 · provisional

- **Decisión:** una PWA instalable en vez de una app nativa. La cámara se usa con `getUserMedia`,
  que exige HTTPS.
- **Descartado:** Expo/React Native, que duplicaría la base de código.
- **Revisar cuando:** el escáner en el navegador sea demasiado lento o impreciso comparado con
  las apps nativas (ManaBox).

## D04 · Stack: Next.js 16 + TypeScript + Postgres + Drizzle + Better Auth — 2026-09-11 · provisional

- **Contexto:** el usuario domina React, Node y Postgres (Cocopool) y prefiere Next.js.
- **Decisión:**
  - Drizzle, por ser ligero y cercano a SQL.
  - Better Auth, porque Auth.js lo mantiene ahora el mismo equipo y recomienda Better Auth para
    proyectos nuevos.
  - shadcn/ui en su variante Base UI, que es la que instala por defecto.
- **Revisar cuando:** algo del stack frene de forma evidente.

## D05 · Hosting: Vercel + Neon; sincronizaciones en GitHub Actions — 2026-09-11 · provisional

- **Decisión:** los planes gratuitos de Vercel y Neon. Las sincronizaciones con Scryfall corren
  en GitHub Actions y no en el cron de Vercel, porque las funciones tienen límite de tiempo y el
  fichero de nombres pesa ~393 MB comprimido.
- **Descartado:**
  - Render (web + Postgres + cron, ~14 $/mes). Es lo que se usa en Cocopool.
  - Solo en local, que no permite usar el escáner desde el móvil.
- **Límites a vigilar:**
  - Neon da 0,5 GB de almacenamiento.
  - Vercel Hobby es solo para uso no comercial.
- **Revisar cuando:** se abra a más usuarios o se acerque el límite de 0,5 GB.

## D06 · Escáner: solo OCR en el dispositivo, sin IA — 2026-09-11 · provisional

- **Contexto:** hay que dar de alta miles de cartas. El usuario prefirió coste cero antes que
  comodidad.
- **Decisión:**
  - Tesseract.js lee el código de edición y el número de colección de la esquina inferior
    izquierda.
  - Lo que no se reconozca va a una cola de revisión manual.
  - Hay un modo "edición fija" para las cartas de 2003 a 2014, que traen número pero no código.
- **Descartado:** Claude con visión como respaldo, a ~1 céntimo por carta, solo en las que falle
  el OCR.
- **Revisar cuando:** se mida la tasa de acierto con cartas reales. Si la cola de revisión crece
  demasiado, volver a plantear la IA como respaldo.
- **Actualización (implementado, 2026-09-11):**
  - La expansión se identifica por el código impreso o, si no lo hay, por el **total impreso**
    ("001/195" → la expansión Pokémon de 195 cartas). Para ello, `sets` guarda `print_code` y
    `printed_total`.
  - En vez de la cola de revisión con miniaturas prevista, el primer respaldo es la búsqueda
    manual dentro de la propia pantalla del escáner, y la elección entre candidatos cuando la
    lectura es ambigua. La cola queda pendiente, por si hace falta.
  - Detalles y mediciones en `docs/scanner.md`.
- **Actualización (tras la primera prueba real, «bastante regular»):**
  - Votación en vez de exigir lecturas consecutivas.
  - **El título como segunda vía**, que cubre Magic antiguo y parte de las full art.
  - Corrección de confusiones del OCR.
  - Pantalla completa con panel de acabado y cantidad.
  - Sigue siendo gratis y en el dispositivo. Si aun así no basta, las opciones siguientes son
    reconocimiento por imagen o IA como respaldo, y las dos requieren decisión del usuario.
- **Actualización (2026-09-12):** el usuario elige la IA como respaldo, con un botón y no
  para cada carta. El OCR sigue siendo la vía principal (D31).
- **Actualización (2026-09-14, una Mew ex promo escaneada desde la pantalla):**
  - En Pokémon, el nombre leído en el título trae también las cartas que se llaman igual más
    un sufijo (ex, V, GX…). El sufijo es un logotipo que el OCR no lee, y sin esto «Mew ex»
    se quedaba en «Mew».
  - Descartado insistir con la franja de datos en las promos SVP y las full art: Tesseract no
    la lee ni más estrecha, ni invertida, ni binarizada. Mediciones en `docs/scanner.md`.

## D07 · Idioma por copia; precio de la edición inglesa — 2026-09-11 · provisional

- **Contexto:** las cartas del usuario están en español y en inglés.
- **Decisión:**
  - El catálogo es el inglés (`default_cards`). El idioma es un atributo de cada copia
    (`items.language`).
  - Los nombres en español se importan aparte (`card_names`) para poder buscarlos.
  - Cardmarket da un precio por producto (edición), así que una copia en español usa el precio de
    su edición inglesa.
- **Revisar cuando:** haga falta el precio por idioma (en algunas cartas antiguas la diferencia
  es grande).

## D08 · Postgres local con PGlite — 2026-09-11 · provisional

- **Contexto:** el Mac del usuario no tiene Docker.
- **Decisión:** `npm run db:dev` levanta PGlite (Postgres compilado a WASM) como servidor en el
  puerto 5433. El código usa el driver `pg` igual que en producción.
- **Descartado:** instalar Postgres con Homebrew, o usar una rama de Neon también en desarrollo.
- **Revisar cuando:** aparezcan diferencias con Postgres real. PGlite reparte las conexiones
  entre muchos clientes y "no todos los casos están garantizados".

## D09 · Búsqueda sin tildes con una columna `search_name` — 2026-09-11 · provisional

- **Decisión:** se guarda el nombre normalizado (minúsculas, sin diacríticos) con índice trigram,
  y la consulta se normaliza igual (`normalizeForSearch()`).
- **Descartado:** la extensión `unaccent`, que no es IMMUTABLE y no se puede indexar sin un
  wrapper.

## D10 · Montones con cantidad, no una fila por copia — 2026-09-11 · provisional

- **Decisión:** `items` es un montón de copias idénticas con `quantity`. Al añadir una copia
  idéntica, sube la cantidad (la regla está en `docs/data-model.md`). "Dividir montón" separa
  copias.
- **Descartado:** una fila por copia física, que multiplicaría las filas con miles de comunes.
- **Revisar cuando:** haga falta seguir copias individuales (gradeadas con número de
  certificado, compras concretas).

## D11 · Histórico de precios solo de lo que tienes — 2026-09-11 · provisional

- **Decisión:** `price_snapshots` guarda cada día solo las ediciones de las que tienes alguna
  copia. El valor de todas tus cartas se guarda aparte, cada día (`inventory_value_snapshots`;
  hasta D23 era por colección).
- **Descartado:** guardar las ~110 000 ediciones cada día (~40 M de filas al año), que no cabe
  en Neon gratis.
- **Consecuencia:** una carta añadida hoy no tiene histórico anterior a hoy.

## D12 · Foil *etched* sin precio — 2026-09-11 · provisional

- **Decisión:** Scryfall no da `eur` para etched, así que cuentan como "sin precio" en vez de
  tomar el de foil.
- **Revisar cuando:** Scryfall lo ofrezca o el usuario tenga muchas cartas etched.

## D13 · Migraciones solo en los despliegues de producción — 2026-09-11 · provisional

- **Decisión:** `vercel-build` solo migra con `VERCEL_ENV=production`, para que un preview no
  cambie el esquema de la base de datos compartida.
- **Revisar cuando:** se configure una rama de Neon por preview.

## D14 · Un solo usuario, registro cerrado, `owner_id` en todo — 2026-09-11 · provisional

- **Decisión:** el usuario se crea con `npm run seed:user`. Todos los datos de colección cuelgan
  de `owner_id`, y las acciones comprueban la propiedad.
- **Revisar cuando:** se abra a otros. Hará falta un registro con límites y revisar las
  condiciones de Scryfall (no se puede cobrar por sus datos).
- **Aislamiento entre usuarios (revisado el 2026-09-11):**
  - Cada consulta de datos de usuario filtra por `owner_id`: colecciones, montones,
    ubicaciones, resumen, progreso por expansión y "en tus colecciones".
  - Cada acción comprueba que la colección, el montón o la ubicación son del usuario.
  - El catálogo (cartas, expansiones, precios, búsqueda y lecturas del escáner) es común y de
    solo lectura.
  - Un segundo usuario se crea con otra ejecución de `npm run seed:user`.
  - Los valores recordados (`useStickyDefaults`) se guardan por dispositivo, no por usuario. Si
    dos personas comparten navegador, los ids ajenos se descartan porque no aparecen entre sus
    opciones.

## D15 · Se excluye todo lo digital — 2026-09-11 · provisional

- **Decisión:** las ediciones y expansiones con `digital: true` (Arena, MTGO) no entran en el
  catálogo. `sets.card_count` se recalcula con las ediciones en papel.

## D16 · Navegación por juego → expansión → cartas — 2026-09-11 · provisional

- **Contexto:** el usuario quiere "entrar en un TCG y ver por expansiones, rarezas…".
- **Decisión:**
  - Rutas `/catalog/[juego]/[expansión]`.
  - Las expansiones se agrupan por tipo (principales, Commander, especiales, promos y tokens).
  - En cada expansión, las cartas que tienes se ven en color y las que no, en gris, con filtros
    por rareza y por "tengo" o "me faltan".
  - La configuración de cada juego está en `src/lib/games.ts`.
- **Revisar cuando:** entre el segundo juego o se quieran otras vistas (por ejemplo, rareza en
  todo el juego, o bloques de expansiones).
- **Actualización (D17–D19):** con Pokémon, la pestaña por defecto es la primera de cada juego
  (Principales en Magic, Megaevolución en Pokémon). Las rarezas que se muestran como filtro salen
  de los datos, así que aparecen aunque no estén en la configuración.

## D17 · Pokémon desde TCGdex: catálogo semanal y precios diarios de lo que tienes — 2026-09-11 · provisional

- **Contexto:** TCGdex es abierta y gratuita, tiene nombres en español y trae precios de
  Cardmarket en €. Pero no ofrece descarga masiva, y solo la petición de una carta concreta
  incluye precios (GraphQL no los expone). Un catálogo completo son ~21 000 peticiones, unos 20
  minutos con 6 en paralelo.
- **Decisión:**
  - `npm run sync:pokemon` hace la sincronización completa (expansiones, cartas, precios y nombres
    en español) **una vez por semana**.
  - `--owned-only` refresca a diario solo los precios de las ediciones que tienes.
  - Se excluye la serie `tcgp` (Pokémon TCG Pocket, que es digital).
  - Workflow: `.github/workflows/sync-pokemon.yml`.
- **Descartado:**
  - Scrydex, porque es de pago.
  - Hacer la sincronización completa a diario: ~700 000 peticiones al mes a una API comunitaria
    que declara unos 10 millones al mes en total.
- **Consecuencia:** los precios de las cartas que no tienes pueden tener hasta una semana de
  antigüedad.
- **Revisar cuando:** TCGdex publique un fichero bulk o un endpoint de precios en bloque, o marque
  límites de uso.

## D18 · Acabados genéricos con nombre por juego; la 1ª edición aún no — 2026-09-11 · provisional

- **Contexto:**
  - Magic tiene normal, foil y etched.
  - En Pokémon hay normal, holo y reverse holo, y en las cartas antiguas, 1ª edición y shadowless.
  - En Cardmarket, el precio base de una carta Pokémon es el de la carta tal como se imprimió
    (normal, u holo si es una rara holo), y el precio "holo" es el de su reverse.
- **Decisión:**
  - No se cambia el enum `finish`. En Pokémon, `nonfoil` significa "estándar" (la carta tal como
    se imprimió) y `foil` significa "reverse holo".
  - Los nombres de cada acabado están en `finishLabels` (`src/lib/games.ts`).
  - Los precios siguen la misma lógica que en Magic: `trend` → `price_eur` y `trend-holo` →
    `price_eur_foil`.
- **Hueco conocido:** la 1ª edición y la shadowless son productos distintos en Cardmarket, con
  precios muy diferentes (un Charizard de Base Set: ~590 € la ilimitada y ~3 500 € la 1ª edición
  shadowless). TCGdex los da en `variants_detailed`, pero hoy **no** se modelan: una 1ª edición se
  valora como ilimitada.
- **Revisar cuando:** el usuario tenga cartas antiguas de Pokémon. Probablemente haga falta una
  fila de catálogo por variante con producto propio, o un campo `edition` en `items` con su precio.

## D20 · Ubicaciones físicas, independientes de las colecciones — 2026-09-11 · provisional

- **Contexto:** el usuario quiere saber dónde está cada carta ("Caja 1") y escanear por sesiones:
  "voy a empezar a escanear la Caja 1", y todo lo que entre desde ese momento va ahí.
- **Decisión:**
  - Tabla `locations` (nombre único por usuario, sin distinguir mayúsculas) e
    `items.location_id` (null = sin ubicación). Sustituye al texto libre `items.location`, que se
    convirtió en filas de `locations` con la migración `0003_backfill_locations`.
  - La colección es cómo agrupas las cartas (Pokémon 151, Para vender) y la ubicación es dónde
    están. Son dos ejes independientes: una colección puede estar en varias cajas y una caja puede
    tener varias colecciones.
  - La ubicación forma parte de la identidad del montón: la misma carta en dos cajas son dos
    montones.
  - **Ubicación de sesión:** el último destino elegido (`lastLocationId`) se recuerda en el
    dispositivo y lo usan todos los formularios de alta. El escáner lo usará igual.
  - Se puede crear una ubicación desde cualquier selector («+ Nueva ubicación…»). Si ya existe
    una con el mismo nombre, se reutiliza.
  - Borrar una ubicación deja sus cartas sin ubicación; no borra cartas.
  - Si la ubicación recordada ya no existe, `addItem` responde `location_not_found` y el
    cliente la olvida.
- **Descartado:** que la caja *sea* la colección. Es más simple, pero impide agrupar las mismas
  cartas de dos formas.
- **Revisar cuando:** hagan falta ubicaciones anidadas (estantería → caja → separador) o una
  posición dentro de la caja (página de la carpeta, orden).
- **Actualización (D23):** las copias ya no pertenecen a ninguna colección. La ubicación sigue
  igual: es un dato opcional de cada montón de tus cartas.
- **Actualización (D28):** una ubicación puede tener separadores, con capacidad y modo
  automático, y las cartas se mueven entre ubicaciones y separadores.

## D21 · Las rarezas se muestran en inglés — 2026-09-11 · provisional

- **Contexto:** al principio las rarezas se tradujeron ("Rara doble", "Mítica"). El usuario
  prefiere los términos en inglés, que son los que usan los coleccionistas.
- **Decisión:** las etiquetas de rareza de `src/lib/games.ts` van en inglés, con la grafía oficial
  ("Double Rare", "ACE SPEC Rare", "Mythic"), en todos los juegos. El resto de la interfaz sigue
  en español.
- **Pendiente de confirmar:** si lo mismo aplica a otros términos de juego que hoy salen en
  español, como el tipo de las cartas de Pokémon ("Pokémon · Fase 2 · Fuego") o los acabados
  ("Estándar").

## D22 · Identidad visual: modo oscuro "mesa de juego por la noche" — 2026-09-11 · provisional

- **Contexto:** el usuario veía la app "algo impersonal, estilos muy planos" y pidió modo oscuro.
- **Decisión:** solo modo oscuro, en índigo de tapete. El oro marca el dinero y las acciones; el
  iridiscente, solo el foil; los colores de rareza son los de los símbolos. Tipografía Archivo
  (ancha en los titulares). Las cartas se tratan como objetos físicos: abanico en el resumen y
  el catálogo, e inclinación con reflejo en la ficha. Detalle en `docs/design.md`.
- **Descartado:** el gris neutro de shadcn tal cual, y los tópicos de las interfaces generadas
  (negro con un único color ácido, degradados decorativos, etiquetas en mayúsculas).
- **Revisar cuando:** el usuario quiera modo claro o un selector de tema.
- **Actualización (2026-09-12):** logo **«Abanico»**: tres cartas en la mano, la de delante
  dorada con el rombo de rareza, con el nombre en Archivo expandida (`src/components/logo.tsx`).
  Se descartaron «Rombo», una carta inclinada con el rombo, que perdía fuerza a 16 px, y
  «Carpeta», una página de nueve con un hueco dorado, cuyos huecos se juntaban a 16 px.

## D19 · "Otras ediciones" de Pokémon agrupadas por nombre — 2026-09-11 · provisional

- **Contexto:** Scryfall tiene `oracle_id`, que agrupa las ediciones de la misma carta. TCGdex no
  tiene nada equivalente.
- **Decisión:** en Pokémon, `oracle_id = "pokemon:" + nombre normalizado`. La búsqueda y "Otras
  ediciones" agrupan por nombre (todos los "Charizard ex"), aunque sean cartas con ataques
  distintos.
- **Revisar cuando:** moleste que se mezclen cartas diferentes con el mismo nombre.

## D23 · Tus cartas por un lado; las colecciones, listas de lo que quieres — 2026-09-11 · provisional

- **Contexto:** probándolo, el usuario vio que para escanear no debería hacer falta ni colección
  ni ubicación, y que una colección (por ejemplo, «Pokédex de Hoenn») es una lista de cartas que
  quiere, las tenga o no: la app le dice cuáles tiene. Sustituye la parte de D10 y D20 en la que
  cada montón pertenecía a una colección.
- **Decisión:**
  - `items` es **tu inventario**: cada montón lleva `owner_id` y, si quieres, `location_id`. Dar
    de alta o escanear solo necesita la carta.
  - `collection_cards` (colección, edición, `quantity` deseada, 1 por defecto) es **la lista**.
    Lo que tienes de ella se calcula cruzando con tus cartas por edición: cuenta cualquier
    acabado, estado, idioma o ubicación.
  - Al dar de alta puedes elegir, **opcionalmente**, una colección (`entryCollectionId`, que se
    recuerda en el dispositivo como la ubicación). La copia entra en tus cartas y, si la edición
    no estaba en la lista, también en la lista.
  - Lo ya dado de alta se añade a una colección en bloque (`addInventoryToCollection`): desde
    «Mis cartas» (con la búsqueda y la ubicación filtradas), desde una ubicación y desde la sesión
    del escáner. Si la edición ya estaba, se queda la cantidad deseada mayor; no se suman.
  - Borrar una colección borra la lista, no tus cartas.
  - El valor diario se guarda por usuario (`inventory_value_snapshots`), no por colección.
- **Migración (`0006`–`0008`):**
  - Las copias de cada colección pasan a su dueño.
  - Cada colección se convierte en una lista con sus ediciones, con cantidad deseada igual a las
    copias que había (máximo 999).
  - Los snapshots por colección se suman en snapshots por usuario.
  - Los montones que quedan repetidos al quitar la colección (misma edición, acabado, estado,
    idioma y ubicación) se fusionan si no tienen notas, precio de compra ni gradeo. Si tienen
    alguno de esos datos, se dejan separados.
- **Descartado:**
  - `items.collection_id` opcional: mezcla "lo que tengo" con "lo que quiero" y no permite
    listas con cartas que no tienes.
  - Entradas de "cualquier edición" ("quiero un Treecko, el que sea"). De momento cada entrada
    es una edición concreta.
- **Revisar cuando:** se quieran entradas por carta en lugar de por edición, por acabado ("lo
  quiero en foil") o colecciones generadas (una expansión entera).
- **Actualización (2026-09-12):** una colección se puede llenar con una expansión entera, o solo
  con una de sus rarezas. Se añade una de cada edición y siguen siendo entradas normales, no una
  colección "viva" que cambie si la expansión cambia. Se hace de dos formas:
  - al crearla en `/collections`;
  - con «Guardar como colección…» en la página de la expansión, para una nueva o para una que
    ya existe.

  Con los álbumes de fútbol servirá igual.

## D24 · Evolución del valor: la gráfica incluye tus altas; "cambio por precios", no — 2026-09-11 · provisional

- **Contexto:** el valor diario (`inventory_value_snapshots`) sube tanto si suben los precios
  como si añades cartas. Una sola cifra de "has ganado X €" mezclaría las dos cosas.
- **Decisión:**
  - La gráfica del resumen enseña el valor de tus cartas cada día, tal cual, y lo dice
    ("también sube cuando añades cartas"). El tooltip incluye cuántas cartas tenías ese día.
  - **"Por cambios de precio"** y la lista de lo que más sube y baja comparan, para cada
    edición y acabado que tienes **hoy**, el último precio guardado con el de hace N días
    (`priceMoves()` en `src/lib/queries/value.ts`). El impacto de cada carta es cantidad ×
    diferencia. Si no hay precio tan antiguo, la carta no entra, así que la cifra refleja solo
    precios.
  - Un periodo (7, 30 o 90 días, o todo) manda sobre la gráfica y sobre las listas (`?period=`).
  - En la ficha de carta, el histórico de cada acabado, que solo existe para las cartas que
    tienes (D11).
  - Gráfica propia en SVG (`<ValueChart>`) en lugar de Recharts: es una línea con tooltip y
    tabla, y no justifica una dependencia.
- **Consecuencia:** hasta que no haya N días de precios guardados, el periodo de N días sale
  vacío. Con «Todo» se compara con el primer día guardado.
- **Revisar cuando:** se apunten precios de compra (beneficio real) o se quiera separar en la
  gráfica lo que es precio de lo que son altas.

## D25 · Cola de revisión con un botón «Para luego», con fotos en Postgres — 2026-09-11 · provisional

- **Contexto:** el plan original guardaba sola cualquier carta que el escáner no reconociera en
  unos 3 segundos. Pero el escáner no sabe si hay una carta en el recuadro o la mesa, así que
  la cola se llenaría de fotos inútiles.
- **Decisión:**
  - Un botón **«¿No la reconoce? Para luego»** en el panel del escáner. Guarda una foto de lo que
    hay en el recuadro, JPEG de 560 px de alto (50–100 KB).
  - Con la foto se guardan lo último leído, el nombre sacado del título (para rellenar la
    búsqueda) y los ajustes de la sesión: acabado, estado, idioma, ubicación y colección.
  - La foto va en Postgres (`pending_scans.image`, `bytea`) y la sirve
    `/api/pending-scans/[id]`, que comprueba el dueño.
  - En `/review` se busca la carta y se añade con los ajustes guardados. Al añadirla o
    descartarla, la fila y la foto se borran.
  - Límites: 400 KB por foto y 500 fotos pendientes por usuario, para no llenar el medio GB de
    Neon.
- **Descartado:**
  - Guardar solas las lecturas fallidas: llenan la cola de fotos de la mesa o de cartas
    movidas.
  - Vercel Blob u otro almacén de ficheros: otro servicio más, para unas pocas decenas de
    fotos que viven poco.
- **Revisar cuando:** la cola crezca mucho, o haga falta guardar fotos para siempre (por
  ejemplo, del estado de cada copia).

## D26 · Entrada manual: la edición se elige viendo la carta, y se busca también por número — 2026-09-11 · provisional

- **Contexto:** el usuario no conseguía añadir a mano un «Charizard ex» desde el móvil: al tocar
  el resultado no pasaba nada.
  - La causa: `/api/printings` solo aceptaba `oracle_id` con forma de UUID, y en Pokémon es
    `pokemon:<nombre>` (D19).
  - Consecuencia: **ninguna carta de Pokémon se podía añadir a mano**.
  - Además, pidió mejorar la entrada manual en general.
- **Decisión:**
  - `/api/printings` acepta cualquier `oracle_id`. Si las ediciones no cargan, el selector lo dice
    en lugar de quedarse en blanco.
  - Tras elegir la carta, sus ediciones salen como **imágenes**: una tira horizontal, de más
    nueva a más antigua, con filtro por expansión o número si hay más de 8. Sustituyen al
    desplegable de texto, porque la edición se reconoce por la ilustración y el símbolo. Sigue
    marcada por defecto la de la última expansión usada.
  - La búsqueda entiende **número más expansión, total impreso o parte del nombre**:
    - por ejemplo, «OBF 125», «125/197», «charizard 125» o «m10 146» (`parsePrintingQuery()`,
      `searchPrintings()`);
    - esos resultados salen primero y van directos a esa edición.
  - Cantidades con −/+ (`QuantityStepper`).
  - Los resultados se eligen con `click`, que dispara igual el dedo. Antes era `mousedown`.
- **Revisar cuando:** haya expansiones con cientos de ediciones de una misma carta (tokens,
  tierras básicas), por si la tira necesita agrupar por expansión.

## D27 · Gradeadas: una fila por copia, y un valor estimado que manda sobre el mercado — 2026-09-12 · provisional

- **Contexto:** el usuario tiene cartas gradeadas y quiere marcar la empresa, la nota y su
  precio potencial. Los precios de Cardmarket que tenemos son de cartas sin gradear, y no hay
  una fuente gratuita de precios de gradeadas.
- **Decisión:**
  - En "Editar", una sección **«Está gradeada»** con la empresa (PSA, BGS, CGC, SGC, TAG, Ace,
    Cardmarket Grading u otra), la nota (medios puntos) y el nº de certificado.
  - **Una copia gradeada es su propia fila**, con cantidad 1: cada funda es una carta
    distinta. Marcar una copia de un montón de varias la separa, y las demás quedan igual.
    Revisa D10, que ya preveía este caso.
  - **Valor estimado por copia** (`estimated_value_eur`), puesto a mano. Si existe, cuenta en
    lugar del precio de mercado en todos los totales: resumen, histórico diario, colecciones y
    expansiones. No es solo para gradeadas: sirve también para firmadas o errores de impresión.
  - Sin valor estimado, una gradeada cuenta con el precio de Cardmarket sin gradear, que es
    más bajo pero no cero.
  - Las copias con valor estimado no se juntan con copias nuevas iguales, y quedan fuera de
    «lo que más sube y baja», porque no siguen al mercado.
- **Descartado:**
  - Precios automáticos de gradeadas (PriceCharting, eBay, 130point): son de pago o solo se
    pueden sacar raspando webs.
  - Subnotas de BGS (centrado, esquinas…) como campos propios: de momento van en las notas.
- **Revisar cuando:** aparezca una fuente gratuita de precios de gradeadas, o haga falta ver
  el histórico de valor de una copia concreta.
- **Actualización (2026-09-12):** en las gradeadas se ve también el precio **raw**, el de
  Cardmarket sin gradear, junto al valor estimado. Aparece en Mis cartas, en las ubicaciones y
  en la ficha, para comparar.

## D28 · Separadores dentro de las ubicaciones, y mover cartas — 2026-09-12 · provisional

- **Contexto:** las cajas del usuario guardan miles de cartas y pone separadores cada N cartas.
  Quiere:
  - un modo automático, pero que se pueda apagar para marcar él cuándo pasa al siguiente;
  - separadores con nombre y capacidad editables;
  - mover cartas, o una selección, de un sitio a otro sin esfuerzo.
- **Decisión:**
  - Tabla `location_sections` (ubicación, posición, nombre y capacidad) y `items.section_id`.
    También `pending_scans.section_id`, para que «Para luego» recuerde el separador.
  - Una ubicación usa separadores si tiene alguno. Se activan en Opciones › Separadores, que
    crea el 1. Los nuevos se numeran por su posición y se pueden renombrar.
  - Por ubicación hay dos ajustes: la capacidad de los separadores nuevos
    (`section_capacity`, vacía = sin límite) y el modo automático (`auto_advance`).
  - El destino de alta incluye el separador. Por defecto es el último que tiene cartas, y se
    recuerda como la ubicación.
  - **Modo automático:** si el separador está lleno (copias ≥ capacidad), `addItem` pone la
    carta en el siguiente, y lo crea si no existe. El cliente avisa con «Separador 3 lleno: pon
    el separador 4», con vibración.
  - **«Siguiente separador»** avanza a mano en cualquier modo, desde los formularios de alta y
    desde el escáner.
  - El separador forma parte de la identidad del montón: la misma carta en dos separadores son
    dos montones.
  - **Mover:**
    - Casillas en las tablas de cartas y «Mover a…» elige ubicación y separador.
    - «Mover…» en el menú de una carta permite elegir cuántas copias.
    - Las copias normales se juntan con un montón igual en el destino; las gradeadas y las que
      tienen valor propio, no.
    - Al mover no se comprueba la capacidad, porque mover es a propósito.
  - Borrar un separador, o quitar los separadores, deja sus cartas en la ubicación, sin
    separador.
- **Descartado:**
  - Ubicaciones anidadas genéricas (estantería → caja → separador): son más flexibles, pero
    complican todos los selectores, y hoy solo hacen falta separadores dentro de una ubicación.
  - Deducir el separador por la posición de la carta en la caja: no guardamos el orden físico.
- **Revisar cuando:** haga falta más de un nivel, o la posición exacta dentro de un separador.

## D29 · Fútbol: álbumes importados de las listas de CromosRepes — 2026-09-12 · provisional

- **Contexto:** el usuario colecciona fútbol (Megacracks, Adrenalyn) y no hay ninguna fuente
  abierta.
  - CromosRepes solo enseña la lista cromo a cromo a un usuario con sesión que sigue la
    colección, en su página «marcar faltas». No tiene API ni exportación.
  - No hay precios de mercado.
- **Decisión:**
  - Juego nuevo, **Fútbol** (`game = sports`, slug `futbol`), sin precios de mercado
    (`hasMarketPrices: false`). Solo cuenta el valor estimado (D27).
  - Cada álbum es una expansión y cada ficha, una carta. Se guardan en `data/albums/` dos
    ficheros por álbum:
    - `<álbum>.txt`: el texto de la página de CromosRepes, sin las marcas del usuario;
    - `<álbum>.json`: código, nombre, línea de producto, fechas de cada edición y códigos de
      equipo.

    `npm run import:album -- <álbum>` los carga en el catálogo. Se puede repetir sin
    duplicar nada.
  - **Cómo se consigue la lista:** leyendo esa página en el navegador del usuario, con su
    sesión y a petición suya, una colección cada vez. Nunca recorriendo el sitio.
  - **Numeración única dentro del álbum:**
    - paralelas con sufijo: `16-POWER`;
    - BIS con sufijo: `21-BIS`;
    - series sin número propio, con prefijo: `SOB-1` (Special One Black), `SOG-1` (Special One
      Gold), `EDL-01` (Edición Limitada) y `AO-01` (Autógrafo Original);
    - listas de control: `CHK-1`;
    - desde 2026-27, `JUST-1` (Just 25) y `SOC-ATM` (Special One Champions, una por club y sin
      número).
  - Los huecos que CromosRepes aún no ha puesto nombre («·21») no se importan: entran al volver
    a importar la lista cuando lo tengan. «(BOX/LATA)» se quita del nombre.
  - La serie es la rareza, con su color.
  - El equipo va en `type_line`, con el código traducido: «RMA» es Real Madrid CF.
  - `(II)` y `(III)` fijan la fecha de salida de la carta.
  - Las bajas conservan «(Baja)» en el nombre.
  - Sin imágenes: un marcador con el número (`label` en `CardThumb` y `HoloCard`).
  - `oracle_id = sports:<nombre>` agrupa todas las fichas de un jugador, como en D19.
  - **Escáner, solo por delante:** las Megacracks no llevan número por delante y escanear
    las dos caras es un suplicio. Con el álbum como expansión fija, se lee el nombre de la
    franja vertical (`NAME_LAYOUTS` por línea de producto) y se ofrecen las fichas del jugador
    en ese álbum, la más sencilla primero (`scanner.md`).
- **Descartado:**
  - Extraer las listas de CromosRepes de forma automática.
  - Leer el número por detrás: obliga a dar la vuelta a cada carta, y la foto compartida
    tiene que ser la cara delantera.
  - Buscar imágenes de forma automática (D. «Fútbol» en la hoja de ruta).
- **Revisar cuando:** CromosRepes ofrezca exportación, o se quiera importar también lo que
  tiene el usuario a partir de sus faltas y repes. Sus marcas vienen en el mismo texto, pero no
  dicen con seguridad qué tiene.

## D30 · Fotos compartidas para las cartas sin imagen — 2026-09-12 · provisional

- **Contexto:**
  - El fútbol (D29) no tiene imágenes, y en Pokémon faltan unas 1 500.
  - No hay una fuente de imágenes que se pueda usar (derechos, condiciones de los buscadores).
  - El usuario quiere que la foto de una carta que alguien escanee se guarde para todos: algo
    colaborativo.
- **Decisión:**
  - Tabla `catalog_card_photos`: una foto por carta (JPEG de 300×419, unos 30 KB), quién la
    aportó y de dónde viene (`scan` o `upload`).
  - Es catálogo, no inventario: la ven todos los usuarios.
  - **Escáner:** al añadir una carta sin imagen, guarda en segundo plano la foto del recuadro,
    si la carta aún no tiene ninguna.
  - **Ficha de la carta:** «Añadir foto» o «Cambiar foto», con la cámara o la galería, recortada
    con la forma de la carta desde el centro.
  - **Actualización (D32):** en los dos casos, la carta se busca en la foto y se endereza, como
    un escaneo. Si no se encuentra, el recorte de antes.
  - **Actualización (2026-09-12):** los administradores (rol `admin`, D34) pueden borrar
    cualquier foto desde la ficha («Borrar foto», con confirmación). La carta se queda sin
    imagen hasta que alguien comparta otra. El resto de usuarios solo puede cambiarlas.
  - Nunca sustituye una imagen del catálogo (Scryfall, TCGdex). Un escaneo no reemplaza una
    foto que ya aportó alguien; «Cambiar foto» sí.
  - `catalog_cards.image_*` apuntan a `/api/card-photos/<id>?v=<fecha>`: pide sesión y se
    guarda en caché un año, porque la fecha cambia la URL.
  - Las sincronizaciones reescriben esas columnas, así que `upsertCatalogCards` vuelve a
    enlazar las fotos después de cada lote (`restorePhotoUrls()`).
  - Espacio: unos 20 MB por álbum entero. Se vigila el medio GB de Neon, y si aprieta se pasan
    a un almacenamiento de ficheros como Cloudflare R2.
- **Descartado:**
  - Fotos privadas de cada usuario: el usuario prefiere compartirlas.
  - Imágenes de terceros.
- **Revisar cuando:**
  - la app se abra a más gente: moderación, quién puede cambiar una foto y los derechos de
    publicar fotos de cartas de Panini;
  - o el espacio en Neon apriete.

## D31 · Identificar con IA como respaldo del escáner — 2026-09-12 · provisional

- **Contexto:**
  - El OCR no puede con el fútbol. Cada serie de Megacracks tiene un diseño distinto: el
    nombre va en vertical en la base y abajo a la derecha en la Élite.
  - Leer la carta entera sin saber dónde mirar no funciona. Medido: solo «YAMAL» en una Élite
    Power, y nada en la base.
  - Escanear por delante y por detrás es «un suplicio», según el usuario.
  - D06 descartó la IA por el coste. Con esto delante, el usuario la prefiere.
- **Decisión:**
  - Botón «Identificar con IA» en el escáner, junto a «Para luego». El OCR, gratis y en el
    dispositivo, sigue siendo la vía principal.
  - Claude Sonnet 5 (`claude-sonnet-5`): una llamada por carta con la foto del recuadro (JPEG
    de 560 px) y salida estructurada. No es un agente.
  - Al modelo se le dice el álbum y se le dan sus series como lista cerrada. En Magic y
    Pokémon se le piden nombre, número y código de expansión.
  - La IA solo lee; qué carta es lo decide el catálogo (`lookupReading`). La serie ordena las
    candidatas, pero nunca descarta ninguna.
  - La clave (`ANTHROPIC_API_KEY`) solo está en el servidor. Sin ella, el botón no sale.
  - Límite de 150 identificaciones por usuario cada 24 horas (`AI_IDENTIFY_DAILY_LIMIT`). Cada
    llamada se apunta en `ai_identifications` con su coste. Además, el tope de gasto de la
    consola de Anthropic.
  - Coste: unos 1 200 tokens de entrada y 50 de salida, unos 0,003 $ por carta (3 $ cada mil).
- **Descartado** (medido con dos fotos, una base y una Élite Power):
  - Haiku 4.5: más barato (0,0012 $), pero falló las dos series y dijo que la base no era una
    carta.
  - Opus 5: más caro (0,007–0,014 $), y falló la serie de la base.
  - Identificar sola cada carta que el OCR no lee: más gasto y llamadas sin querer. Se puede
    añadir con un interruptor si el botón se queda corto.
  - Una posición de nombre por cada diseño de serie: funciona (86 % en la Élite), pero hay que
    calibrar cada diseño de cada álbum.
  - Reconocimiento por imagen: necesita una foto de referencia por carta. Más adelante, con las
    fotos compartidas (D30).
- **Revisar cuando:** se mida con más series (solo hay dos fotos probadas), si el gasto sube, o
  si un modelo más barato acierta igual.

## D32 · Fotos de cartas enderezadas en el dispositivo, sin IA — 2026-09-12 · provisional

- **Contexto:**
  - Las fotos compartidas (D30) eran el recorte del recuadro guía: torcidas y con trozos de
    mesa. El usuario pidió que la IA las limpiara.
  - Claude no edita imágenes. Pedirle las esquinas de la carta para enderezarla nosotros no
    sirve: con cartas giradas sobre un fondo, Sonnet 5 falló por 33–90 px en una carta de
    380 px de ancho (12–24 %).
- **Decisión:** detectar los bordes en el propio dispositivo (`src/lib/scan/card-quad.ts`,
  funciones puras sobre RGBA):
  - Busca en el recuadro, con un 12 % de margen alrededor, a 360 px de ancho: gradiente de
    color, varias candidatas por línea de barrido y, en cada lado, la recta más exterior en la
    que coinciden muchas líneas.
  - Si falta un lado, lo deduce de los otros tres y la forma 63×88.
  - Endereza la carta con una homografía y le ajusta los niveles, sin cambiar el tono.
  - Si no hay bordes claros, o la forma no es de carta, usa el recorte de siempre: nunca
    inventa.
  - Se usa en la foto compartida del escáner, en «Para luego», en «Identificar con IA» y en
    «Añadir foto» de la ficha (`src/lib/card-photo.ts`).
  - Medido el 2026-09-12: 0–2 px de error en composiciones con esquinas conocidas, y bien en
    tres fotos reales (fondo rojo y tapete verde con textura, con el borde inferior de césped
    sobre verde). 50–150 ms por foto en un Mac.
- **Descartado:**
  - Pedir las esquinas a la IA: imprecisa (arriba).
  - Modelos que generan imágenes: inventarían detalles de la carta.
  - OpenCV.js: ~8 MB de descarga para lo mismo.
- **Revisar cuando:** falle con fotos reales del escáner, o se quiera usar también para el OCR
  (la carta enderezada pone las franjas exactamente donde tocan, pero habría que hacerlo en
  cada fotograma).

## D33 · Reconocer las cartas por su foto compartida — 2026-09-12 · provisional

- **Contexto:** el escáner solo reconocía leyendo texto. Una carta sin número legible (Élite,
  Flashback…) había que identificarla con la IA cada vez, aunque ya tuviera foto: le pasó al
  usuario con la Flashback Anthology de Messi, Suárez, Lamine Yamal y Lewandowski.
- **Decisión:**
  - Cada foto compartida (D30) guarda su huella perceptual (`catalog_card_photos.hash`): pHash
    de 63 bits, con una rejilla de 32×32 y el 6 % de cada borde fuera
    (`src/lib/scan/card-hash.ts`). La calcula el servidor al guardarla, con sharp. Las
    anteriores la reciben la primera vez que se piden.
  - Al empezar, el escáner descarga las huellas del álbum fijado, o todas si no hay ninguno
    (`GET /api/scan/hashes`). Una de cada tres lecturas endereza la carta (D32), calcula su
    huella y busca la más cercana en el propio dispositivo.
  - Cuenta si está a 12 bits o menos y a 6 o más de la siguiente. Como el OCR, la misma
    carta tiene que salir en 2 de las últimas 6 lecturas.
  - Si no se encuentran los bordes, no compara: sin enderezar, la huella de la misma carta se
    va hasta 26 bits.
  - Así, la primera vez una carta sin texto legible se identifica con la IA (D31), y a partir
    de ahí se reconoce sola, gratis y para todos.
  - Medido el 2026-09-12 con cuatro cartas reales, enderezadas y fotografiadas de nuevo con
    giro, luz, desenfoque y JPEG: la misma carta quedó a 8 bits como mucho (3 de media); la
    carta distinta más cercana, a 22.
- **Descartado:**
  - pHash de 255 bits: el hueco entre «la misma» y «otra» era menor (54 frente a 112).
  - Comparar en el servidor: una petición por lectura, cuando las huellas de un álbum entero
    son unos pocos KB.
  - Huellas calculadas por el móvil y enviadas con la foto: con el servidor hay una sola
    fuente y se pueden rellenar las fotos antiguas.
- **Revisar cuando:** con muchas fotos haya falsos positivos entre cartas de la misma serie
  (todas comparten plantilla), o no reconozca cartas brillantes por los reflejos.

## D34 · Roles y cuentas para compartir la app con colegas — 2026-09-12 · provisional

- **Contexto:** el usuario va a compartir Cardllector con colegas. Hasta ahora había una sola
  cuenta (más una de prueba), el registro estaba cerrado y el administrador salía de una
  variable de entorno con correos (`ADMIN_EMAILS`), puesta solo para borrar fotos.
- **Decisión:**
  - El plugin de administración de Better Auth: `user.role` (`admin` o `user`, por defecto
    `user`), desactivar cuentas (`banned`: no pueden entrar y se cierran sus sesiones) y sus
    operaciones de servidor (`createUser`, `setRole`, `banUser`, `unbanUser`), que comprueban
    el rol de quien las pide.
  - **El registro sigue cerrado.** Las cuentas las crea un admin en `/admin`, con una contraseña
    inicial que le pasa a su colega. Ahí también se cambia el rol, se desactiva una cuenta y
    se ve lo que gasta cada una en IA.
  - Un admin no puede cambiarse el rol ni desactivarse a sí mismo, para no dejar la app sin
    admin.
  - Qué puede un admin: gestionar cuentas y borrar fotos compartidas (D30). Lo demás es igual
    para todos. Cada uno ve solo sus cartas, colecciones y ubicaciones (`owner_id`); el
    catálogo y las fotos compartidas son comunes.
  - Todos pueden usar «Identificar con IA», con el límite de 150 al día por cuenta (D31),
    pagado con la clave del dueño.
  - La migración hace admin a la cuenta más antigua (la del dueño, creada con
    `seed:user`) y `user` al resto. `npm run seed:user` crea admins por defecto.
- **Descartado:**
  - `ADMIN_EMAILS`: no escala a más permisos y había que tocar Vercel para cada cambio.
  - Registro abierto o enlaces de invitación por correo: más trabajo (envío de correos) para
    unos pocos colegas.
  - Activar la IA cuenta por cuenta: el usuario prefiere que todos puedan usarla.
- **Revisar cuando:** haga falta que cada uno cambie su contraseña o la recupere (hoy no hay
  pantalla para eso), más roles (por ejemplo, quien importe álbumes), o límites de IA por
  cuenta.

- **Actualización (2026-09-15):**
  - **Restablecer contraseñas.** Un admin pone una contraseña nueva a otra cuenta, escrita o de
    14 caracteres al azar, sin letras que se confundan. Se enseña una sola vez, para pasarla, y
    por defecto se cierran las sesiones de esa cuenta (`setUserPassword` y `revokeUserSessions`
    del plugin `admin` de Better Auth). La propia no se cambia desde aquí, como el rol.
  - **Revisar las fotos compartidas (D30).** En `/admin`, las fotos que suben los usuarios,
    primero las pendientes. «Correcta» las marca como revisadas (`reviewed_at`, `reviewed_by`) y
    «Eliminar» las borra, y la carta se queda sin imagen. Si alguien sube otra foto de la carta,
    vuelve a estar pendiente.

## D35 · Mazos de Magic (Commander), con análisis y copias físicas — 2026-09-13 · provisional

- **Contexto:** el usuario quiere montar sus mazos de Magic, sobre todo de Commander, con un
  análisis como el de Moxfield (tipos, curva de maná…), y que cada mazo ocupe copias físicas de
  su colección.
- **Decisión:**
  - **Datos de juego por carta** (`oracle_cards`, una fila por `oracle_id`): coste de maná, CMC,
    colores, identidad de color, tipos, texto, palabras clave, maná que produce, legalidad en
    ocho formatos y si está en la lista de Game Changers de Commander. Salen del mismo
    `default_cards` de la sincronización diaria, de la primera impresión en papel de cada
    carta.
  - **Mazos** (fase 2): formato, tableros (comandante, principal, banquillo y «quizá»), e
    importar y exportar la lista como la dan Moxfield o Arena (`1 Sol Ring (C21) 263`).
  - **Análisis:** curva de maná por tipo, CMC medio, reparto por tipos, símbolos de color frente a
    fuentes, validación de Commander (100 cartas, una copia de cada, identidad de color del
    comandante, prohibidas, Game Changers) y precio.
  - **Copias físicas:** cada mazo tiene su ubicación, su caja. Ocupar una copia es moverla a
    esa ubicación con lo que ya existe (D28). Así el mazo sabe qué tiene dentro, qué está en
    otra caja y qué falta, y cuánto cuesta.
- **Descartado:**
  - Pedir los datos a la API de Scryfall al analizar: prohibido en el camino de una petición
    (convenciones del repo) y lento.
  - Guardar las 23 legalidades de Scryfall: la mayoría son formatos digitales o de nicho.
  - Una tabla aparte con qué copias ocupa cada mazo: duplicaría las ubicaciones, y una copia
    solo puede estar en un sitio.
- **Revisar cuando:** se quieran categorías funcionales (rampa, robo, eliminación…), una mano
  de prueba o mazos de otros juegos.
- **Actualización (fase 2, implementada el 2026-09-13):**
  - `decks` y `deck_cards`. Las cartas van por carta (`oracle_id`) y tablero, con una edición
    preferida opcional. La imagen y el precio son los de tu copia en la caja si la hay (desde
    el 2026-09-14, abajo); si no, los de la edición preferida o, sin ella, la imagen más
    reciente y el precio de la edición más barata.
  - `/decks` lista los mazos. `/decks/[id]` muestra las cartas agrupadas por tipo y el
    análisis. Se entra desde «Mazos» en la barra y desde el selector Colecciones / Mazos.
  - Importar pegando la lista; se reconocen el nombre completo o la cara delantera, sin
    fichas ni cartas de arte, y la edición si la línea la indica. Exportar copia la lista con
    las cabeceras de Moxfield y Arena.
  - Estado de cada carta del comandante y del mazo principal: en la caja, en otra ubicación
    (con «Traer»), en otro mazo o te falta.
  - «Traer a la caja» mueve con `moveItems` las copias libres: nunca de la caja de otro mazo
    ni gradeadas; primero las de la edición preferida, luego las que no tienen ubicación y las
    ediciones más baratas.
  - Borrar un mazo borra su caja; sus cartas quedan en Mis cartas sin ubicación.
  - El análisis es puro (`src/lib/decks/analysis.ts`) y tiene tests. Solo valida Commander.
- **Actualización (fase 3, 2026-09-13):**
  - **Funciones** (`src/lib/decks/roles.ts`): rampa, robo, eliminación, barrido, contrahechizo y
    tutor.
    - Se deducen del texto de reglas con expresiones regulares, sin el texto recordatorio.
      Las tierras no tienen funciones; buscar tierras es rampa, no tutor.
    - Son una aproximación: cada carta se puede corregir a mano (`deck_cards.roles`, null =
      automático) y volver a lo automático.
    - El panel las cuenta frente a una referencia habitual en Commander: unas 10 de rampa, 10 de
      robo, 10 de eliminación y 3 barridos.
  - **Mano de prueba** (`src/lib/decks/test-hand.ts`):
    - baraja el mazo principal (el comandante empieza aparte) con `crypto.getRandomValues` y
      roba 7;
    - mulligan London con el primero gratis, como en multijugador, eligiendo qué va al fondo;
    - «Robar» para simular turnos.
  - **Probabilidad hipergeométrica** de una mano inicial con 2 a 4 tierras.
  - **Descartado:** etiquetas libres como las de Moxfield. De momento bastan las seis funciones.
- **Actualización (2026-09-14):** el usuario tenía escaneada la full art de su comandante, y el
  mazo seguía enseñando la edición de la lista aunque «Traer» había movido su copia a la caja.
  - Cada carta enseña y valora la copia que tiene en la caja: la de la edición preferida si
    está, si no la más valiosa, con su valor como el de cualquier copia (D27). Sin copia en la
    caja, como antes. Al exportar sale esa edición.
  - «Traer» elige primero las copias de la edición preferida.
  - **Descartado:** cambiar la edición preferida al traer una copia: la lista es lo que el
    usuario eligió, y la caja ya dice lo que tiene.

## D36 · Buscar la carta en toda la imagen del escáner — 2026-09-14 · provisional

- **Contexto:**
  - El escáner leía siempre lo que caía en el recuadro guía. Con un card slinger la carta se ve
    pequeña: había que ajustar el recuadro a mano y, si no quedaba justo, la franja de datos no
    caía en el número. El usuario pidió que el lector encontrara la carta solo.
  - Con sus fotos del slinger, `detectCardQuad` (D32) elegía las paredes de la caja: toma la
    recta más exterior de cada lado y supone que la carta llena el recorte.
- **Decisión:** un segundo detector, `findCard` (`src/lib/scan/find-card.ts`, puro, sobre RGBA),
  que busca la carta en todo lo que se ve entre las barras, a 360 px de ancho:
  - Las 30 rectas más fuertes casi verticales y las 30 casi horizontales (transformada de Hough
    con votos ponderados por el gradiente, hasta ±14°).
  - Cada cuatro que formen un cuadrilátero con forma de carta (63:88 ± 0,09, al menos el 6 % de
    la imagen) se puntúan por la fuerza de sus lados, medida sobre los propios lados (mediana),
    menos lo que cada recta sigue más allá de las esquinas: el borde de una carta acaba en sus
    esquinas, una pared o el borde de un tapete no.
  - Media geométrica de los cuatro lados, para que uno débil hunda el cuadrilátero, y
    penalizaciones suaves si se aleja de 63:88 o si sus lados opuestos no son paralelos.
  - Al final cada lado se empuja hacia fuera, hasta un 5 % del ancho, al borde más exterior que
    tenga al menos la mitad de fuerza: el borde del diseño suele ser más fuerte que el de la carta.
  - En el escáner, en cada lectura (`locateCard`): la carta cuenta cuando sale dos veces seguidas
    en el mismo sitio y se descarta cuando falla dos. Entonces se dibuja su contorno en verde, el
    recuadro pasa a segundo plano y se lee la caja que la rodea en lugar del recuadro: número,
    título, huella (D33), «Para luego», IA y foto compartida. Si tras tres lecturas no lee nada,
    una de cada dos vuelve al recuadro, por si lo encontrado no era la carta.
  - La franja del número de una carta encontrada llega hasta un 8 % por debajo de ella
    (`FOUND_INFO_STRIP`). En el slinger, el borde negro de la carta no se distingue del fondo
    oscuro, así que lo que encuentra es el marco de dentro, y el número va impreso en ese borde.
    - **Actualización (2026-09-14):** cuando se encuentra la carta entera (una mesa, una
      pantalla), esa franja cae por debajo del número y no lo lee en ninguna de 20 muestras.
      Ahora hay dos franjas (`FOUND_INFO_STRIPS`): sobre la carta y por debajo. Se prueban por
      turnos y se queda la que da una línea del catálogo, hasta que se pierde la carta.
      Descartada una sola franja que cubra las dos: mete más texto de la carta en el slinger, y
      sin sus fotos no se podía comprobar que no empeorara.
    - **Actualización (2026-09-14, tras escanear un mazo de 100 cartas):**
      - La franja que lee se queda para toda la sesión, no hasta perder la carta. Se perdía al
        sacar cada una, y la siguiente empezaba alternando. Cada 4 lecturas seguidas sin línea
        se mira una vez la otra, por si se cambia de la mesa al slinger.
      - Una carta encontrada no se suelta, y por tanto no se vuelve a añadir, mientras siga a la
        vista, aunque no se lea nada en varias lecturas seguidas: así se duplicaban.
    - **Actualización (2026-09-16, cartas normales que no se leían):** el problema no era el ritmo,
      sino cómo se segmenta la franja. Se lee ahora como texto disperso (PSM 11) y no como un
      bloque: el nombre del artista va en una columna al lado del número y, como bloque, Tesseract
      los juntaba. Medido con 15 cartas: 9 de 15 con número y código, frente a 8, sin perder
      ninguna, corrigiendo dos lecturas equivocadas y 20 ms más rápido.
      **Descartada** una franja más estrecha y ajustada a la línea: leía la foto con la que se
      diseñó, pero baja a 6 de 15 porque en muchos marcos se come la fila del número. Y
      **descartada otra vez** la franja única que cubre las dos posiciones: se reprobó ahora que
      PSM 11 separa bloques, y se queda en 8 de 15, sin leer la foto real y 4× más lenta. Ver
      `docs/scanner.md`.
    - **Actualización (2026-09-16, el código de expansión):** con la app ya desplegada, la carta se
      leía («Leyendo NCC 285 EN…») y no se añadía: la franja daba `WCC` por `NCC` y `lookupScan`
      exigía un código existente, así que devolvía cero candidatas. Ahora, como último recurso
      —después del código exacto y del total impreso—, vale un código de la misma longitud que se
      diferencie en una posición: el número sigue teniendo que cuadrar, así que no inventa cartas,
      y si encajan varias se eligen a mano. De punta a punta, 14 de 15 se resuelven. **Queda
      abierto** cuál de las dos franjas elige el móvil: en las capturas la amarilla caía sobre el
      texto de ambientación, no sobre el número.
    - **Actualización (2026-09-16, la franja de debajo estaba mal puesta):** midiendo los
      rectángulos que la propia app pinta en una captura del móvil, lo que encuentra `findCard` es
      el **marco de dentro** de la carta (del 4,2 % al 93 % de su alto), no la carta; su ratio es
      de carta (0,721) porque el marco interior también lo es. Su borde de abajo es la línea de
      tipo, así que la franja, que empezaba en el 93 %, metía «Basic Land — Plains» en grande
      encima del número; y al empezar en `x0 = 0` cortaba los primeros caracteres —se ve el
      recuadro partiendo la `S` de `SLD`—, que es lo de `248`→`48`→nada del vídeo. La franja pasa a
      **x 0–45 %, y 98–109 %**: sobre la foto real lee `NCC` donde antes leía `WCC`, que es lo que
      no arreglaba ninguna mejora de imagen. **El banco de pruebas con imágenes de catálogo no
      puede juzgar esto**, ni con la caja bien modelada: son escaneos limpios donde el código nunca
      se lee mal, así que queda solo como comprobación de que la franja no se sale de sitio. Ver
      `docs/scanner.md`.
  - Se puede apagar en los ajustes del escáner («Buscar la carta», `findCard` en el dispositivo).
  - `detectCardQuad` sigue enderezando la carta dentro de esa caja (D32), donde sí la llena.
  - Medido el 2026-09-14 con 5 fotos del slinger del usuario, recortadas a 16:9 como las ve el
    escáner, y 5 fotos anteriores:
    - La encuentra en 4 de las 5 del slinger y en las 5 anteriores (fondo rojo, verde, marrón,
      cartas giradas). Falla con una carta de fútbol oscura, cuyo borde de arriba se confunde con
      la sombra: elige otro trozo.
    - Leyendo un solo fotograma por foto: la franja nueva lee el número en 2 de las 4 cartas de
      Magic (SLD 1990 y HOB 0003), y una tercera con una cifra mal. Con la franja del recuadro,
      en ninguna: caía en el texto de la carta.
    - 25–60 ms por fotograma en un Mac.
- **Descartado:**
  - Ajustar `detectCardQuad`: su supuesto, que la carta llena el recorte y el borde es la recta
    más exterior, es justo lo que falla con las paredes.
  - De los cuadriláteros casi tan buenos como el mejor, quedarse con el más grande: en el slinger
    elegía el hueco de la caja.
  - Exigir que lo que rodea a la carta sea de un solo color: las paredes del slinger tienen luces
    y sombras y no lo separaba.
  - OpenCV.js (~8 MB) o pedírselo a la IA (impreciso y de pago por fotograma), como en D32.
- **Revisar cuando:** se pruebe en el móvil (el tiempo por fotograma, si la lectura se hace más
  lenta) y con más fondos; si confunde el hueco del slinger a menudo, usar el recuadro como pista
  de dónde buscar.

## D37 · Asistente: preguntas a la IA sobre tus propios datos — 2026-09-14 · provisional

- **Contexto:** el usuario quiere preguntarle a la IA por sus colecciones, mazos y precios, en
  una app que ya comparte con colegas (D34) y que ya tenía clave de Anthropic para
  «Identificar con IA» (D31).
- **Decisión:**
  - Un chat (`/assistant`) con Claude Sonnet 5 y siete herramientas de solo lectura
    (`src/lib/assistant/tools.ts`):
    - resumen (totales por juego, colecciones, mazos y ubicaciones);
    - buscar en tus cartas, con filtros;
    - tus cartas de Magic por sus reglas: identidad de color, tipo, texto, función, sueltas o
      no, y sin las que ya tiene un mazo, para montar y mejorar mazos;
    - una colección, con lo que falta;
    - un mazo, con su análisis y dónde están sus copias;
    - la evolución del valor y los precios que la han movido;
    - el catálogo.
  - Cada herramienta es una consulta de `src/lib/queries/assistant.ts` con el usuario de la
    sesión: el modelo nunca escribe SQL ni puede pedir datos de otro.
  - El bucle lo lleva el SDK (`toolRunner` en streaming), con hasta 10 llamadas por respuesta
    y esfuerzo medio. `/api/assistant` devuelve una línea JSON por evento: texto, qué está
    consultando y, al final, lo que ha costado.
  - Las instrucciones y las herramientas (unos 4.200 tokens) van a la caché de la API: después
    de la primera pregunta se leen a 0,1× el precio. La conversación también (`cache_control`
    en la petición): cada paso del bucle reenvía los resultados de las consultas anteriores.
  - Los resultados son compactos (sin campos vacíos) y llevan las rutas de la app, para que la
    respuesta enlace lo que menciona. El Markdown se pinta con un subconjunto propio
    (`markdown.ts`): nada de HTML, y solo enlaces a rutas de la app.
  - Con cada pregunta viaja el texto de los últimos 20 turnos de la conversación, sin los
    resultados de las herramientas. Al principio la conversación se guardaba en el navegador;
    ahora, en la base de datos (actualización de abajo).
  - Cada respuesta apunta su coste en `ai_chat_turns`. Límite de 5 $ por usuario y mes natural
    (`AI_ASSISTANT_MONTHLY_USD`); `/admin` enseña el gasto de 30 días.
  - Medido el 2026-09-14 con los datos reales del usuario:
    - «¿Cuáles son mis 3 cartas más valiosas y dónde están?»: una consulta, 0,017 $, la primera
      palabra a los 2,7 s y 5 s en total.
    - «¿A mi mazo de Pantlaza le falta rampa o robo? ¿Qué tengo suelto que encaje?»: cuatro
      consultas y 15 s. El mazo ocupa unos 6.000 tokens y se reenvía en cada paso: 0,072 $ con
      solo las instrucciones en la caché, 0,052 $ con la conversación también.
- **Descartado:**
  - Pasarle toda la colección en cada pregunta: con miles de cartas, caro y lento.
  - Dejar que escriba SQL: más flexible, pero un error o una inyección leería datos de otros.
  - Managed Agents o el Agent SDK: un bucle con herramientas propias cabe en una ruta de Next.
  - Opus 5 por defecto (2,5 veces más caro) o Haiku 4.5 (más barato, peor en bucles largos).
  - Que haga cambios: de momento no hace falta. Si llegan, con confirmación.
- **Revisar cuando:** se quiera que haga cambios, o el gasto real se aleje de lo medido.
- **Actualización (2026-09-14, el mismo día):** el usuario quiere no perder las conversaciones
  al empezar otra, y un chat flotante para ir preguntando mientras mira mazos o colecciones.
  - Las conversaciones se guardan en la base de datos (`ai_chat_threads`, `ai_chat_messages`),
    solo el texto de cada pregunta y respuesta: se ven igual en el móvil y en el ordenador.
    «Nueva conversación» ya no borra la anterior; hay una lista para abrirlas, seguirlas o
    borrarlas. `/api/assistant` recibe la pregunta y la conversación, y lee el historial de ahí.
  - Cada usuario solo ve las suyas, pero quedan en la base de datos de la app: el dueño, con
    acceso directo a ella, podría leer las de los colegas. Se les dijo al decidirlo.
  - **Chat flotante** (`dock.tsx`, en el layout): un botón en todas las páginas menos el escáner
    y la del asistente. Abre un panel a la derecha en el ordenador y una hoja desde abajo en el
    móvil, y sigue abierto (y respondiendo) al navegar. En el móvil, pinchar un enlace de la
    respuesta lo cierra para ver la página. `/assistant` queda como vista grande, con la lista.
  - **Sabe qué página tienes abierta:** con cada pregunta va la ruta, y el servidor la convierte
    en una línea de contexto con el nombre y el id («[Page: the user is looking at their deck
    «Pantlaza» …]», `pageContext`), que va al modelo pero no se guarda. Así «este mazo» es el de
    la pantalla, y las sugerencias cambian con la página.
  - **Coste:** igual. Las conversaciones antiguas no se envían; solo la que se está usando, como
    antes. La línea de contexto son unas decenas de tokens y ahorra buscar de qué mazo se habla.
  - **Descartado:** guardarlas solo en el navegador (cada dispositivo tendría las suyas).
- **Actualización (2026-09-15, el usuario lo veía caro):**
  - **Medido en `ai_chat_turns`:** 3 respuestas en 30 días, a 0,05–0,07 $ cada una, más del
    triple de lo medido al decidirlo. El 81 % era escritura en caché, y la caché de la
    conversación casi no se reaprovecha entre preguntas: el usuario pregunta con horas de
    diferencia.
  - **Lo que pesaba:** lo que devuelven las herramientas, que se escribe en caché y se reenvía
    en cada paso de la respuesta. Contado con `count_tokens` sobre los datos reales del usuario:
    - `get_deck` de un mazo de 100 cartas: 12.071 tokens;
    - `search_my_cards` por defecto: 4.674;
    - `find_owned_magic_cards`: 4.988;
    - las definiciones de las siete herramientas: 3.430, reescritas en cada pregunta.
  - **Cambios:**
    - Las cartas van en líneas con las columnas nombradas una vez (`src/lib/assistant/lines.ts`),
      en vez de objetos JSON que repetían cada clave en cada fila. En el mazo, por tablero, y
      dónde están las copias solo si no están todas en la caja.
    - `search_my_cards` devuelve 10 filas por defecto, no 25, y el enlace de cada ubicación una
      sola vez; `search_catalog`, 5 ediciones por carta, no 10.
    - Los esquemas de las herramientas se aplanan (`leanSchema` en `tools.ts`). El SDK los
      generaba con una `$ref` por cada campo con descripción, la URL `$schema` y una expresión
      regular de 150 caracteres por uuid. La entrada se sigue validando con zod.
    - Cada consulta apunta su tamaño en los logs (`[assistant] get_deck: N characters`).
  - **Resultado, con los mismos datos:**
    - `get_deck`: 6.581 tokens (−45 %), 11.802 con el texto de reglas (antes 17.285);
    - `search_my_cards`: 1.237 (−74 %);
    - `find_owned_magic_cards`: 3.832 (−23 %);
    - `search_catalog`: 845 (−34 %);
    - las definiciones: 2.230 (−35 %).

    Estimado, sin medir en respuestas reales: una pregunta sobre el mazo pasa de ~0,05 $ a
    ~0,033 $, y una sobre tus cartas, a menos de la mitad.
  - **Descartado de momento:**
    - la caché de 1 hora, porque las preguntas llegan con más de una hora de diferencia;
    - la búsqueda de herramientas y los skills, que no compensan con 7 herramientas y 941
      tokens de instrucciones;
    - bajar el esfuerzo o cambiar de modelo, que cambiarían las respuestas y habría que
      compararlas antes.

## D38 · La app se llama Tapmat — 2026-09-14 · provisional

- **Contexto:** «Cardllector» costaba de leer y de decir (la «dll» parece una errata), y
  «collector» se había quedado corto: la app tiene también mazos, escáner, asistente y álbumes
  de cromos. El usuario pidió darle una vuelta al nombre y al logo, y lo quería en inglés.
- **Decisión:**
  - **Tapmat:** *tap*, girar una carta en Magic (y tocar la pantalla), y *mat*, el tapete. Corto,
    se dice igual en español y en inglés y no es un nombre genérico.
  - **Logo «Carta girada»:** una carta dorada girada sobre su zona del tapete, con el rombo de
    rareza de la app (docs/design.md). Dibuja las dos mitades del nombre.
  - Cambian la interfaz, el logo y el icono, el manifiesto de la PWA, `package.json`, el
    `User-Agent` para Scryfall y TCGdex (`Tapmat/0.1`) y los documentos.
  - **No cambian** las claves internas `cardllector:*` del navegador (ajustes recordados, sesión
    del escáner, conversación abierta del asistente): cambiarlas perdería lo guardado en cada
    dispositivo, y nadie las ve. Tampoco la carpeta local del proyecto.
  - El repo se renombró a `Tornamorell/tapmat` el mismo día; GitHub redirige el nombre viejo.
    El dominio, si se quiere, lo cambia el usuario (roadmap, «Pendiente del usuario»).
- **Descartado:**
  - Tapete: gustó, pero se prefirió en inglés.
  - Playmat: es un objeto que se compra, no suena a app, y es imposible de encontrar.
  - Tap-it: el guion estorba, y suena a la instrucción de un botón.
  - Pulls: más de coleccionista que de jugador; encaja peor con los mazos.
  - Los logos Abanico (el anterior: continuidad, pero un recurso muy visto) y Zona de juego
    (mejor para «Tapete»).
- **Revisar cuando:** se abra la app a más gente y haga falta comprobar marcas o dominios.
