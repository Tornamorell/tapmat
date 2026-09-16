# Arquitectura

Tapmat (hasta el 2026-09-14, Cardllector; D38) es una aplicación personal para registrar colecciones de cartas (Magic, Pokémon y
fútbol) con su precio de mercado y la evolución de su valor. La usan su dueño y unos pocos
colegas: cada uno ve sus cartas (todo lleva `owner_id`), el catálogo y las fotos compartidas son
comunes, y las cuentas las crea un admin (D34).

## Piezas

| Pieza | Qué es |
| --- | --- |
| App | Next.js 16 (App Router) + React 19, desplegada en Vercel. Web y móvil (PWA en la fase 3). |
| Base de datos | Postgres: Neon en producción, PGlite en local. Esquema y migraciones con Drizzle. |
| Auth | Better Auth, email + contraseña, registro cerrado (`ALLOW_SIGNUP` solo lo abre el script de alta). Roles `admin` y `user` con su plugin de administración: las cuentas de los demás las crea un admin en `/admin` (D34). |
| Catálogo y precios | Magic: ficheros bulk diarios de Scryfall. Pokémon: API de TCGdex. Los dos se importan con GitHub Actions (ver `docs/data-sources.md`). |

```
Scryfall bulk (data.scryfall.io)
   │  default_cards.jsonl.gz — diario, ~78 MB
   │  all_cards.jsonl.gz     — semanal, ~393 MB (solo nombres en español)
   ▼
GitHub Actions ── scripts/sync-scryfall.ts ──► catalog_cards, sets  (game = mtg)      ┐
               ── scripts/sync-names.ts   ──► card_names                               │
               ── scripts/sync-pokemon.ts ──► catalog_cards, sets, card_names         ├─ Postgres
                  ▲  (game = pokemon; completo los miércoles, precios propios a diario) │
                  │                                                                    │
TCGdex API (api.tcgdex.net) — una petición por carta                                   │
               └─ snapshotPrices()        ──► price_snapshots,                         │
                                             inventory_value_snapshots                ┘
                                                        ▲
Navegador ── páginas (Server Components) + Server Actions ┘
```

## Navegación

| Ruta | Qué muestra |
| --- | --- |
| `/` | Resumen: lo que valen tus cartas, su evolución (`?period=7`, `30` —por defecto—, `90` o `all`), cuánto ha cambiado el valor por los precios y lo que más ha subido y bajado, el progreso de tus colecciones y tus cartas más valiosas. |
| `/catalog` | Los juegos: Magic, Pokémon y Fútbol. Los álbumes de fútbol se importan de listas de CromosRepes y no tienen precio de mercado (D29). |
| `/admin` | Solo admins (`requireAdmin()`, 404 para el resto): crear cuentas, cambiar el rol, desactivar, restablecer la contraseña de otro (con la opción de cerrar sus sesiones) y lo que gasta cada uno en IA (D34). También las fotos compartidas, primero las pendientes, para marcarlas como correctas o eliminarlas, y debajo las cartas sin imagen que alguien tiene en una ubicación o ha puesto en una colección, para ir a fotografiarlas (D30). |
| `/decks` | Mazos de Magic (Commander): comandantes, colores, cartas, precio, avisos de reglas y cuánto hay en su caja (D35). |
| `/decks/[id]` | Un mazo: sus cartas por tipo, con dónde están sus copias y «Traer» a la caja; «Añadir a la lista lo de la caja», al revés; el análisis (curva, tipos, colores, reglas de Commander, Game Changers); pegar y copiar la lista (D35). |
| `/catalog/[juego]` | Las expansiones del juego, agrupadas por tipo (principales, Commander, especiales, promos), con cuántas cartas tienes de cada una y lo que valen. |
| `/catalog/[juego]/[expansión]` | Todas las cartas de la expansión en orden de número. Las que no tienes salen en gris. Se filtra por rareza y por "tengo" o "me faltan", y cada carta tiene un botón **+** para añadirla. |
| `/cards/[id]` | Una edición concreta: precio, histórico de precio (si la tienes) y el resto de sus ediciones. Desde aquí se añaden copias a tus cartas y se apunta la edición en una colección, la tengas o no. Enseña dónde tienes cada copia y en qué colecciones está, y se puede cambiar sin ir a ellas (2026-09-15): cada copia tiene el −/+ y el menú ⋯ de «Mis cartas» (editar, marcar gradeada, mover, dividir, eliminar), y cada colección, las copias que quieres −/+ y quitarla (×). |
| `/inventory` | **Mis cartas:** todas tus copias, con alta rápida desde el teclado, filtro por ubicación (`?loc=<id>` o `?loc=none`) y búsqueda. «Añadir a una colección» mete en una lista todo lo que se ve con esos filtros. |
| `/collections`, `/collections/[id]` | Tus colecciones: listas de ediciones con la cantidad que quieres de cada una. Se ve lo que tienes y lo que te falta, lo que vale lo que tienes y lo que costaría completarla. Filtros: todas, tengo y me faltan. Se pueden crear llenas con una expansión entera o una de sus rarezas: aquí mismo, o con «Guardar como colección…» en la página de la expansión. A una ya creada se le añade una expansión entera desde la propia colección, con «Añadir una expansión entera…» (2026-09-15). La lista de expansiones solo se pide al pulsarlo (`/api/sets`): son unas 1.200, demasiadas para mandarlas con cada colección. Las cartas que ya estaban conservan las copias que quieres. Una colección se ve en «Cuadrícula» (las cartas, con el **+** para añadir copias) o en «Lista» (`?view=list`), para gestionarla. En la lista las cartas se seleccionan con una casilla, y una barra abajo las mueve a otra colección, o a una nueva, las copia («Dejarlas también aquí») o las quita de la lista (2026-09-15, `moveCollectionCards`, `removeCardsFromCollection`). Si ya estaban en la otra, se queda el número mayor de copias que quieres, no la suma: cada colección cuenta tus copias por su cuenta. |
| `/locations`, `/locations/[id]` | Ubicaciones físicas: qué hay en cada una y cuánto vale. `/locations/none` muestra las copias sin ubicación. Una ubicación puede tener separadores (Opciones › Separadores). Se ven como fichas con lo lleno que está cada uno, y filtran con `?section=<id>` o `?section=none` (D28). |
| `/search` | Búsqueda por nombre, en inglés o en español. |
| `/assistant` | **Asistente** en grande: tus conversaciones a la izquierda (abrir, seguir, borrar) y la abierta a la derecha; `?thread=<id>` abre una. En el resto de páginas, menos el escáner, está el mismo asistente como chat flotante (`dock.tsx`, en el layout), que sabe qué página tienes abierta (D37). |
| `/api/assistant` | Lo que hay detrás del asistente: guarda la pregunta en su conversación (o en una nueva), se la pasa a Claude con el historial, la página abierta y herramientas de solo lectura sobre los datos del usuario (`src/lib/assistant/tools.ts`, consultas en `src/lib/queries/assistant.ts`), y devuelve la respuesta en streaming, una línea JSON por evento, y la guarda. Comprueba la sesión y el límite del mes, y apunta lo que cuesta cada respuesta (D37). |
| `/api/card-photos/[id]` | La foto compartida de una carta sin imagen de catálogo (D30). Pide sesión y se guarda en caché un año, porque la URL lleva la versión. |
| `/scan` | Escáner con la cámara: lee el número y el código de expansión de la carta y la añade a tus cartas, en la ubicación y la colección de la sesión si las has elegido. `?set=mtg:m10` arranca en modo expansión fija. Detalles en `docs/scanner.md`. |
| `/review` | **Por revisar:** las cartas que guardaste con «Para luego» en el escáner, con su foto (servida por `/api/pending-scans/[id]`, solo para su dueño) y una búsqueda para identificarlas y añadirlas (D25). |

"Tienes X de Y" en una expansión cuenta las ediciones distintas de tus cartas.

Los formularios de alta comparten el selector `EntryTarget` (`src/components/entry-target.tsx`),
que tiene dos partes:

- **Guardar en:** la ubicación y, si tiene separadores, el separador, con el botón «Siguiente
  separador».
- **Y en la colección:** la colección, opcional. En la página de una colección no sale
  (`withCollection={false}`), porque lo que se añade allí ya está en ella.

Junto a los **+** de una expansión y de una colección sale además `EntryCopyFields`: «Por
defecto» con el idioma, el estado y el acabado con que añade el **+**.
- Son los mismos que usan el alta rápida, la ficha de carta y el escáner.
- Antes el **+** los usaba sin enseñarlos. Como el idioma de partida era el español (`es`), las
  cartas del catálogo entraban en español sin avisar (2026-09-15).
- Ahora el idioma de partida es el **inglés**, porque el dueño tiene casi todo en inglés y solo
  algunas colecciones en español. Solo cambia en los dispositivos que no guardaron nunca los
  valores: al cambiar cualquiera se guardan todos, así que en los demás hay que cambiarlo una
  vez.
- En la colección también se ve la ubicación en la que entran.

Todo se recuerda en el dispositivo (`useStickyDefaults`). `useEntryResult()` aplica la respuesta
de `addItem`:

- olvida un destino que ya no existe;
- sigue el paso automático al siguiente separador y avisa de que hay que ponerlo.

En las tablas de cartas, las casillas seleccionan montones. Una barra abajo permite:
- moverlos a otra ubicación y separador;
- añadirlos a una colección;
- cambiarles a la vez el estado, el idioma o el acabado («Editar…», `updateItems`, 2026-09-15).
  Lo que no se toca se queda como está. Un montón que queda igual que otro se junta con él, como
  al mover, salvo los gradeados o con valor estimado. Si la edición no sale en ese acabado, se
  queda con el suyo y se avisa;
- eliminarlos (`deleteItems`), con confirmación.

«Mover…», en el menú de cada carta, mueve solo algunas copias (`moveItems`, D28).

La búsqueda de los formularios de alta (`useCardPicker`, `/api/search`) acepta dos cosas:

- un nombre, en inglés o en español;
- una expansión y un número, como «OBF 125», «125/197» o «charizard 125».

Tras elegir la carta, sus ediciones salen como imágenes para tocar la tuya (`CardPickerRow`,
D26).

En el móvil (por debajo de `md`), la navegación es una barra de pestañas fija abajo: Resumen,
Catálogo, **Escanear** en el centro, Mis cartas y Colecciones. A las ubicaciones se llega desde
Mis cartas. La búsqueda y el botón de salir van como iconos en la barra superior. Desde `md`
hacia arriba se ven todos los enlaces en texto en la barra superior
(`src/app/(app)/nav-links.tsx`).

## Reglas que no hay que romper

- **Nunca se llama a la API de Scryfall desde una petición del usuario.** La API tiene límites
  duros (2 peticiones/s en `/cards/search`, `/cards/named` y `/cards/collection`; un 429 supone un
  bloqueo) y Scryfall exige usar los ficheros bulk para búsquedas rápidas. Toda búsqueda y todo
  escaneo van contra nuestra base de datos.
- Las peticiones a `api.scryfall.com` llevan `User-Agent: Tapmat/0.1` y `Accept`
  (`src/lib/scryfall/client.ts`).
- Los datos de Scryfall no se pueden cobrar. Si la app se abre algún día, el catálogo tiene que
  seguir siendo accesible gratis.
- Cada página y cada Server Action comprueba la sesión con `requireUser()`. `src/proxy.ts` solo
  hace una comprobación optimista de la cookie, y las rutas `/api/*` responden 401 por su cuenta.
- Las acciones comprueban además que el montón, la colección o la ubicación pertenecen al
  usuario.

## Precios

- La referencia es **Cardmarket en €**:
  - Magic: `prices.eur` y `prices.eur_foil` de Scryfall.
  - Pokémon: `trend` y `trend-holo` (reverse) de TCGdex.
  - Cómo se llama cada acabado en cada juego: D18 en `docs/decisions.md`.
- Una copia en otro idioma se asocia a la edición inglesa (mismo `set` y `collector_number`): en
  Cardmarket el producto es la edición, y el idioma es un atributo de la copia.
- Los foil *etched* no tienen precio en € en Scryfall, así que cuentan como "sin precio".
- El valor de tus cartas, y el de lo que tienes de una colección, no cuenta las copias sin
  precio: se muestran aparte. "Te falta ~X €" suma el precio normal de las copias que faltan.
- Si una copia tiene **valor estimado** (gradeadas, firmadas…), ese valor cuenta en todos los
  totales en lugar del de Cardmarket (D27).
- El precio unitario de mercado está implementado dos veces, en `unitPriceEur()` (TypeScript) y
  en `unitPriceEurSql` (SQL). El valor de una copia, estimación incluida, también: en
  `itemValueEur()` y en `itemValueEurSql`. Están en `src/lib/collection/pricing.ts`. Si cambias
  uno, cambia su gemelo.

## Desarrollo local

Hace falta Node 24 o superior. No hace falta Docker: `npm run db:dev` levanta un Postgres real
(PGlite) en el puerto 5433 y guarda los datos en `.pglite/`.

```bash
npm install
cp .env.example .env.local        # y rellena BETTER_AUTH_SECRET (openssl rand -base64 32)
npm run db:dev                    # déjalo corriendo en otra terminal
npm run db:migrate
npm run seed:user -- tu@email.com una-contraseña Marc
npm run sync:scryfall             # ~40 s: catálogo, precios y snapshot del día
npm run sync:names                # ~2,5 min: nombres en español
npm run sync:pokemon              # ~20 min: catálogo de Pokémon desde TCGdex
npm run dev
```

Otros comandos:

- `npm run sql -- "select …"`: consulta a la base de datos local, que no tiene psql.
- `npm run snapshot:prices -- 2026-09-10`: guarda el snapshot de una fecha.
- `npm run db:generate`: genera una migración tras cambiar `src/db/schema.ts`.
- `npm test`, `npm run typecheck`, `npm run lint`.

## Despliegue

Vercel (app) + Neon (Postgres) + GitHub (código y Actions). Todo en los planes gratuitos (D05).

### 1. GitHub

Crea un repositorio **privado** y vacío (sin README) y sube el código:

```bash
git remote add origin git@github.com:<usuario>/tapmat.git
git push -u origin main
```

### 2. Neon

Crea un proyecto con Postgres 17 en la región **Frankfurt** (`eu-central-1`), cerca de España y
de la región `fra1` de Vercel. Neon da dos cadenas de conexión:

- **Pooled** (el host lleva `-pooler`): para la app en Vercel, que abre muchas conexiones cortas.
- **Direct:** para migraciones y sincronizaciones (scripts y GitHub Actions).

### 3. Cargar la base de datos desde tu Mac

Node no sobrescribe variables que ya estén definidas en el entorno, así que exportar
`DATABASE_URL` basta para que los scripts apunten a Neon en lugar de a `.env.local`:

```bash
export DATABASE_URL='postgresql://…@ep-….eu-central-1.aws.neon.tech/neondb?sslmode=require'  # direct
npm run db:migrate
npm run sync:scryfall      # ~1 min
npm run sync:names         # ~3 min
npm run sync:pokemon       # ~8 min
npm run seed:user -- tu@email.com 'una-contraseña-larga'
unset DATABASE_URL
```

### 4. Vercel

Importa el repo desde vercel.com. Detecta Next.js solo. Variables de entorno (Production):

| Variable | Valor |
| --- | --- |
| `DATABASE_URL` | La cadena **pooled** de Neon |
| `BETTER_AUTH_SECRET` | Uno nuevo, distinto del local: `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | La URL de producción, por ejemplo `https://cardllector.vercel.app` |
| `ANTHROPIC_API_KEY` | Opcional: activa «Identificar con IA» en el escáner (D31) y el asistente (D37). Sin ella, el botón no sale y el asistente dice que no está configurado |
| `AI_IDENTIFY_DAILY_LIMIT` | Opcional: identificaciones con IA por usuario cada 24 horas (150 por defecto) |
| `AI_ASSISTANT_MONTHLY_USD` | Opcional: lo que puede gastar cada usuario en el asistente por mes natural, en dólares (5 por defecto) |

Las funciones corren en `fra1` (Fráncfort), la misma zona que Neon. Lo fija `vercel.json`
(`"regions": ["fra1"]`), no el panel. También deja Fluid compute activado (`"fluid": true`):
Vercel lo activa por defecto en los proyectos nuevos desde abril de 2025, pero así no depende
del panel. Reutiliza instancias entre peticiones, aunque tras un rato sin uso la primera sigue
arrancando en frío, en cualquier plan.
- Vercel pone `iad1` (Washington) por defecto en los proyectos nuevos. El 2026-09-15 producción
  seguía ahí (`x-vercel-id: cdg1::iad1::…`), aunque esta guía decía que se cambiara en
  *Settings → Functions*.
- Así, cada consulta a la base de datos cruzaba el Atlántico. Una página hace varias seguidas (la
  sesión y después las suyas), y un cambio en «Mis cartas» sumaba la acción y la página entera.
  Pasaba lo mismo con cada búsqueda del escáner en el catálogo y con cada consulta del asistente.
- Para comprobarlo: `curl -sI https://<dominio>/api/auth/get-session | grep x-vercel-id`. La
  segunda parte es donde corre la función.

**Cambiar de página.** Todas las páginas de la app son dinámicas (datos del usuario), y Next no
precarga las rutas dinámicas sin un `loading.tsx`. Por eso, al pulsar un enlace no pasaba nada
visible hasta que llegaba la página entera.
- `src/app/(app)/loading.tsx` (2026-09-15) es un esqueleto que se precarga y sale al instante;
  la cabecera y la barra de pestañas se quedan.
- Medido ese día desde España:
  - una función en caliente responde en 0,15–0,22 s;
  - la primera, en frío, en 1,2 s;
  - conectar a Neon, 250–340 ms, y cada consulta, unos 40 ms, sin arranque en frío de la base
    de datos.
- **Descartado:** la caché de sesión de Better Auth en cookie. Con la región ya en `fra1`,
  ahorraría un par de milisegundos por página, y una cuenta desactivada seguiría entrando hasta
  que caducara la cookie.

- El script `vercel-build` aplica las migraciones **solo** en producción (`VERCEL_ENV=production`),
  para que un preview no cambie el esquema de la base de datos compartida (D13). Un cambio de
  esquema se prueba en local o en una rama de Neon.
- En los previews **no funciona el login**, porque `BETTER_AUTH_URL` apunta a producción. Sirven
  para ver que el build pasa.
- `src/db/client.ts` llama a `attachDatabasePool()` en Vercel, para que las instancias
  suspendidas no dejen conexiones abiertas en Neon.

### 5. GitHub Actions

En el repo, *Settings → Secrets and variables → Actions*, crea `DATABASE_URL` con la cadena
**direct**. Los workflows también se pueden lanzar a mano con *Run workflow*:

- `sync-scryfall.yml`: diario, 10:00 UTC.
- `sync-names.yml`: los lunes.
- `sync-pokemon.yml`: precios de lo que tienes a diario a las 11:15 UTC, y catálogo completo los
  miércoles.

### SSL

`pg` avisa de que en su próxima versión mayor `sslmode=require` pasará a la semántica de libpq,
que comprueba menos el certificado. Neon admite `sslmode=verify-full`: conviene usarlo en las
cadenas de conexión antes de actualizar a `pg` 9.

### Tamaño

Los dos catálogos ocupan ~109 MB en Neon (2026-09-11). Los snapshots solo se guardan para las
ediciones que tienes, así que crecen poco. Hay que vigilar el límite de 0,5 GB del plan gratuito
de Neon.
