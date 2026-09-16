# Fuentes de datos

De dónde sale el catálogo y los precios de cada juego, con lo verificado sobre cada fuente.
Si compruebas algo que ha cambiado, actualízalo aquí y pon la fecha.

## Magic: Scryfall (en uso)

Verificado el 2026-09-11 contra `api.scryfall.com` y la documentación.

**Ficheros bulk.** `GET /bulk-data` lista los ficheros; cada uno trae `jsonl_download_uri`, un
`.jsonl.gz` con una carta por línea, servido desde `data.scryfall.io` sin límite de peticiones.
La respuesta ya no incluye `download_uri`.

| Tipo | Tamaño comprimido | Uso |
| --- | --- | --- |
| `default_cards` | ~78 MB | Cada edición en inglés, o en su idioma si solo existe en uno. Es el catálogo y la fuente de precios, y se sincroniza a diario. |
| `all_cards` | ~393 MB | Todas las ediciones en todos los idiomas. Solo lo usamos para los nombres en español, cada semana. |
| `oracle_cards`, `unique_artwork`, `rulings`, tags | — | Sin uso por ahora. |

**Precios.**
- Cada carta trae `prices` con `eur`, `eur_foil` (Cardmarket), `usd`, `usd_foil`, `usd_etched` y
  `tix`. Son strings o null.
- No hay `eur_etched`.
- Las ediciones en otros idiomas de `all_cards` suelen tener los precios a null.
- Scryfall actualiza precios **una vez al día**; el bulk se publica sobre las 09:00 UTC.

**Límites de la API** (no aplican a los ficheros bulk):
- `/cards/search`, `/cards/named`, `/cards/random` y `/cards/collection`: 2 peticiones/s.
- `/cards/manifest`: 10 peticiones/minuto.
- El resto: 10 peticiones/s.
- Un 429 bloquea el acceso 30 s, y abusar puede suponer un veto. Hay que usar el bulk para
  búsquedas rápidas y cachear al menos 24 h.

**Cabeceras obligatorias:** un `User-Agent` propio (usamos `Tapmat/0.1`) y `Accept`.

**Condiciones de uso:**
- No se puede cobrar por acceder a sus datos.
- No se puede sugerir que Scryfall avala el proyecto.
- Las imágenes se sirven desde `cards.scryfall.io` y los iconos de expansión desde
  `svgs.scryfall.io`.

**Datos que conviene conocer:**
- Unos 118 000 objetos en `default_cards`, de los que ~9 400 son solo digitales (descartados).
  Quedan ~108 500 ediciones en papel.
- Hay 988 expansiones en papel; 528 tienen `parent_set_code` (tokens y promos hijos de una
  expansión).
- `set_type` puede ser: core, expansion, commander, masters, draft_innovation, eternal, promo,
  token, memorabilia, box, funny, duel_deck, masterpiece, starter, planechase, archenemy,
  from_the_vault, premium_deck, minigame, arsenal, vanguard, spellbook… Los grupos de navegación
  están en `src/lib/games.ts`.
- `rarity` puede ser: common, uncommon, rare, mythic, special (y bonus).
- Las cartas de doble cara y las reversibles guardan la imagen, y a veces el `oracle_id`, en
  `card_faces[]`.

**Datos de juego** (verificado el 2026-09-13 con `/cards/named`; los guarda `oracle_cards`,
D35):
- `mana_cost` (string, `"{4}{W}{W}{W}"`), `cmc` (número), `colors`, `color_identity`,
  `oracle_text`, `keywords`, `produced_mana`, `layout` (`normal`, `modal_dfc`, `transform`…).
- `cmc` puede tener decimales (0,5 en cartas Un) y llega a 1 000 000: Gleemax, la única carta
  con 1 000 o más (verificado el 2026-09-13). La columna es `numeric(10, 1)`; con
  `numeric(6, 1)` la sincronización fallaba con «numeric field overflow».
- Las cartas de doble cara no traen `mana_cost`, `colors` ni `oracle_text` arriba, sino en cada
  cara. `cmc`, `color_identity`, `produced_mana` y `legalities` sí van arriba.
- `legalities` tiene 23 formatos (standard, future, historic, timeless, gladiator, pioneer,
  modern, legacy, pauper, vintage, penny, commander, oathbreaker, standardbrawl, brawl,
  competitivebrawl, alchemy, paupercommander, duel, oldschool, premodern, predh, tlr), con los
  valores `legal`, `not_legal`, `banned` o `restricted`. Guardamos ocho.
- `game_changer` (booleano): la carta está en la lista de Game Changers de Commander, que marca
  el nivel (bracket) de un mazo. Por ejemplo, The One Ring.

Código: `src/lib/scryfall/` (cliente, tipos y mapeo) y `scripts/sync-scryfall.ts`,
`scripts/sync-names.ts`.

## Pokémon: TCGdex (en uso)

Verificado el 2026-09-11 contra `api.tcgdex.net/v2`. Ver D17, D18 y D19 en `docs/decisions.md`.

**Qué es.** [TCGdex](https://tcgdex.dev) es una base de datos abierta (MIT) con API REST y
GraphQL en 14 idiomas. No documenta límites de peticiones y dice atender unos 10 millones al
mes. Mandamos `User-Agent: Tapmat/0.1` y como mucho 6 peticiones en paralelo. Con 8 en
paralelo sirvió 80 cartas en 4 s sin errores.

**Endpoints que usamos** (todos bajo `https://api.tcgdex.net/v2/{idioma}`):

| Endpoint | Devuelve |
| --- | --- |
| `/sets` | Lista breve de expansiones (218 en inglés, 154 en español): id, nombre, logo, símbolo y número de cartas. |
| `/sets/{id}` | La expansión con `serie {id, name}`, `releaseDate`, `abbreviation.official` (por ejemplo "MEW"), `cardCount` y la lista breve de sus `cards`. |
| `/cards/{id}` | La carta completa con **precios**. Es la única vía para tener precios: GraphQL no los expone y los listados tampoco. |
| `/cards` | Lista breve (id y nombre) de todas las cartas del idioma, en una sola petición: 23 548 en inglés y 15 322 en español. Así sacamos los nombres en español. |
| `/series`, `/rarities` | 21 series y los nombres de las rarezas. |

**Ids.**
- El id de una carta es `{set}-{localId}` (por ejemplo `sv03.5-199`) y **es el mismo en todos
  los idiomas**, así que los nombres en español se enlazan por id.
- `localId` es el número de colección y puede ser "001", "TG30", "SV001" o "!".

**Carta completa.** Los campos que leemos:
- `name`, `rarity` (en inglés y con mayúsculas inconsistentes; los guardamos en minúsculas y
  "Holo Rare" pasa a "rare holo").
- `category` (Pokemon, Trainer, Energy), `stage`, `types`, `trainerType`, `energyType`.
- `image`.
- `variants {normal, reverse, holo, firstEdition, wPromo}`.
- `variants_detailed`: cada variante con su producto de Cardmarket y TCGplayer; aquí es donde
  aparecen la 1ª edición y la shadowless.
- `pricing`.

**Precios** (`pricing`):
- `cardmarket` en EUR, con `idProduct`, `avg`, `low`, `trend`, `avg1`, `avg7` y `avg30`, más los
  mismos con sufijo `-holo`.
  - Los campos sin sufijo son la carta tal como se imprimió.
  - Los `-holo` son su **reverse holo**. Solo tienen sentido si la carta tiene variante reverse;
    si no, pueden venir con valores sin sentido.
  - Un 0 significa que no hay dato.
- `tcgplayer` en USD, por variante con claves en kebab-case: `normal`, `holofoil`,
  `reverse-holofoil`… Cada una trae `marketPrice`, `midPrice`, etc.
- Cardmarket se actualiza a diario y TCGplayer cada hora.

**Recursos gráficos.**
- Imagen de carta: `{image}/low.webp` (~245 px) y `{image}/high.webp` (~600 px); también hay
  `.png` y `.jpg`.
- Logo de expansión: `{logo}.webp` y `{logo}.png`. Lo anuncian **todas** las expansiones.
- **Símbolo: está en la ruta de idioma, no en la que anuncia la API.** El campo `symbol` apunta a
  `https://assets.tcgdex.net/univ/<serie>/<set>/symbol`, y ese fichero casi nunca existe. Hay que
  pedir `.png` **cambiando `/univ/` por `/en/`**. Medido el 2026-09-16 sobre las 169 que anuncian
  símbolo:

  | Variante | Con imagen de verdad |
  | --- | --- |
  | `/en/…symbol.png` | **148** |
  | `/univ/…symbol.png` | 1 (me05) |
  | `/univ/…symbol.webp`, `.jpg`, o sin extensión | 0 |

  - Ninguna vale sola: en `/en/` no está me05 y en `/univ/` no están las demás. Y cuatro
    expansiones **no anuncian símbolo** y aun así lo tienen donde el resto (me02, mep, ex5.5,
    exu), así que hay una tercera candidata, construida con la serie y el código. De eso se
    encarga `symbolCandidates()` (en `map.ts`), la mejor primero, y la sincronización se queda con
    la primera que sea una imagen.
  - De nuestras 203 expansiones, **147** tienen símbolo por alguna de las tres vías; 56 no lo
    tienen por ninguna (promos, trainer kits, las de McDonald's…).
  - Son cuadrados y pequeños (25×25, ~4 KB), así que entran en el hueco de 16 px de `SetIcon`. El
    logo es apaisado (684×158, `logo.webp` de 24–140 KB) y no hace falta como respaldo.
- **Trampa del servidor de recursos** (comprobada el 2026-09-16, y conviene no olvidarla):
  `assets.tcgdex.net` responde **200 con una página HTML de 295 bytes** a cualquier ruta que no
  tenga, incluidas las inventadas (`/univ/me/noexiste/symbol`). De ahí que:
  - la URL «sin extensión» **parezca** funcionar y no funcione: devuelve esa página, no una
    imagen. Se probó cambiar a `{symbol}` por eso y se revirtió el mismo día;
  - un `HEAD` con `res.ok` no valga como prueba de existencia: `assetExists` comprueba además que
    el `content-type` empiece por `image/`;
  - lo mismo pase con las cartas: `{image}` a secas da la página y la imagen está en
    `{image}/high.webp`.
- **Cartas sin imagen:** 1 560 de 21 068 (7,4 %), y van por subconjuntos enteros: Celebrations
  Classic Collection (25), Shining Fates Shiny Vault (122), MEP Black Star Promos (89), Shining
  Legends (78), Dragon Majesty (78), Crown Zenith Galarian Gallery (70), las trainer galleries y
  los trainer kits. No es cosa de la sincronización: `/cards/{id}`, que es de donde saca los
  datos, devuelve `image: null` en todas ellas (comprobado el 2026-09-16 con `cel25cc-CC001`,
  `swsh4.5sv-SV001` y `swsh12tg-TG01`). Las cubren las fotos compartidas (D30).

**Primera sincronización completa** (2026-09-11, 6 peticiones en paralelo):
- 7,5 minutos para 203 expansiones y 21 068 cartas, sin ningún 404.
- El 94 % de las cartas tiene precio en €, y 7 972 tienen precio de reverse holo.
- Se guardaron 3 589 nombres en español distintos del inglés; los nombres de Pokémon suelen
  coincidir en los dos idiomas.

**Series.** `set_type` guarda el id de serie: misc, base, gym, neo, lc, ecard, ex, pop, tk, dp,
pl, hgss, col, bw, mc, xy, sm, swsh, sv, me y tcgp. **`tcgp` es Pokémon TCG Pocket (digital) y se
excluye.**

La alternativa es [Scrydex](https://scrydex.com/docs), la continuación de pago de pokemontcg.io,
con histórico, gradeadas y más juegos.

Código: `src/lib/tcgdex/` (cliente con reintentos, tipos y mapeo) y `scripts/sync-pokemon.ts`.

## Fútbol: listas de CromosRepes (verificado el 2026-09-12)

No hay catálogo ni API de precios abiertos. Las referencias de precio son las ventas cerradas de
eBay, 130point y Card Ladder, sin API pública. Los álbumes salen de las listas de
[CromosRepes](https://cromosrepes.com/) (D29).

- Tiene más de 8 500 colecciones.
- **La ficha pública** (`/coleccion/ficha/<COLECCIÓN>`) da editorial, formato, total y una
  descripción de las series, pero no la lista.
- **La lista cromo a cromo** solo sale con sesión iniciada y la colección añadida a «Mis
  listas», en la página «marcar faltas» (`/app/listas/marcar/<usuario>/<lista>/1`):
  - secciones por equipo y por serie;
  - cada ficha como «·número código nombre EQUIPO (edición)»;
  - antes de cada ficha marcada, una línea con un número: son las faltas o repes del usuario.
- No tiene API ni exportación. Sus condiciones limitan el uso al personal y no dicen nada del
  acceso automático. `robots.txt` pide 5 segundos entre peticiones.
- Se copia el texto de esa página, una colección cada vez y a petición del usuario, y
  `src/lib/albums/cromosrepes.ts` lo convierte en cartas.
- Ejemplo: Liga 2025-26 Megacracks, 717 fichas con paralelas, BIS, bajas, series especiales,
  ediciones limitadas y autógrafos.
- Liga 2026-27 Megacracks (lista leída el 2026-09-13, primera edición del 7 de agosto de 2026):
  549 fichas. Trae huecos de jugador sin nombre todavía («·21») y series nuevas con otros
  formatos (Enjoy, Stars On 25, Just 25, Box Premium 25 Aniversario).
- No hay imágenes. Las cartas llevan un marcador con su número.

## IA: API de Claude (verificado el 2026-09-12)

«Identificar con IA» en el escáner (D31) usa la API de Anthropic con el SDK oficial,
`@anthropic-ai/sdk`.

- Precios por millón de tokens, entrada y salida, según
  [la página de precios](https://platform.claude.com/docs/en/about-claude/pricing):
  - Sonnet 5: 2 $ y 10 $. Era el precio de lanzamiento y se ha quedado como el estándar.
  - Haiku 4.5: 1 $ y 5 $.
  - Opus 5: 5 $ y 25 $.
- Una foto de carta de 560 px de alto, con las instrucciones, son unos 1 000–1 200 tokens.
- No hay nivel gratuito. Se paga con saldo prepagado (las cuentas nuevas traen algo para
  probar), y la consola permite poner un tope de gasto.
