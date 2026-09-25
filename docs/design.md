# Diseño visual

Dirección elegida el 2026-09-11, cuando el usuario pidió modo oscuro y un aspecto «más chulo»
porque lo veía plano e impersonal. Es provisional como todo lo demás (ver D22 en
`docs/decisions.md`).

## Concepto: la mesa de juego por la noche

- **Las cartas ponen el color.** La interfaz son superficies oscuras en índigo, como un tapete y
  fundas, y deja que las ilustraciones sean lo que se ve.
- **Cada color significa algo:**
  - **Oro** = dinero (valores, precios, total) y acciones principales.
  - **Iridiscente** = foil. Solo sale en copias foil (`<CardThumb foil>`), nunca de adorno.
  - **Colores de rareza** = los de los símbolos de expansión.
- **Las cartas son objetos:** proporción 63×88, esquinas elípticas como las reales y sombra
  debajo (`.card-frame`).
- **El elemento memorable:**
  - Tus cartas más valiosas en abanico en el resumen (`<CardFan>`).
  - En el catálogo, las más valiosas de cada juego.
  - En la ficha de una carta, la imagen se inclina hacia el puntero y refleja la luz
    (`<HoloCard>`). Todo lo demás, sobrio.

## Paleta (modo oscuro, `globals.css`)

| Token                      | Hex                                                                                       | Uso                                                |
| -------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `--background` (tapete)    | `#16142B`                                                                                 | Fondo                                              |
| `--card` (funda)           | `#201D3A`                                                                                 | Paneles, tablas, fichas                            |
| `--border`                 | `#322E55`                                                                                 | Bordes                                             |
| `--foreground` (cartulina) | `#ECE8F7`                                                                                 | Texto                                              |
| `--muted-foreground`       | `#9C96BF`                                                                                 | Texto secundario                                   |
| `--primary` / `--gold`     | `#E9B949`                                                                                 | Dinero, acciones principales, pestaña activa, foco |
| `--foil`                   | Degradado cian → violeta → rosa → oro                                                     | Película foil                                      |
| `--rarity-*`               | common `#A9A4C7`, uncommon `#A8C8DC`, rare `#E9B949`, mythic `#F0703C`, special `#B98BF0` | `<RarityMark>`                                     |

### Gráficas

Siguen las especificaciones de la skill `dataviz`. Los colores se validan con su script
(`validate_palette.js --mode dark --surface "#201d3a"`).

| Token               | Hex                   | Uso                                                                                |
| ------------------- | --------------------- | ---------------------------------------------------------------------------------- |
| `--chart-1`         | `#BC8A26`             | Línea del valor y del precio normal: el oro, un paso más oscuro que el del texto   |
| `--chart-2`         | `#9379D7`             | Línea del precio foil: el violeta del foil, un paso más oscuro                     |
| `--gain` / `--loss` | `#5FD39A` / `#F07167` | Subidas y bajadas. Siempre con flecha y signo (`<Delta>`), nunca solo con el color |

Los oros del texto (`#E9B949`) y el violeta del foil son demasiado claros para una línea sobre
`--card`: el validador pide una luminosidad OKLCH entre 0,48 y 0,67 en oscuro.

- La gráfica es `<ValueChart>` (`src/components/value-chart.tsx`), en SVG y sin librerías:
  - Líneas de 2 px. Con una sola serie, un velo del 10 % bajo la línea y el valor al final.
  - Con dos series, leyenda.
  - Cruz que salta al día más cercano, con el puntero o con las flechas del teclado.
  - «Ver los datos» abre la tabla equivalente.

La app va **siempre en oscuro** (`<html class="dark">`). Los tokens claros de `:root` siguen
siendo los de shadcn por si algún día se añade un selector de tema.

## Tipografía

- **Una sola familia: Archivo** (`next/font`, eje `wdth`).
- **Titulares** (`h1`–`h3` y `.display`) en anchura 125 y negrita, con aire de caja de sobres.
- **Texto** en anchura normal.
- Precios en columnas con `tabular-nums`. Los números grandes sueltos (el valor total), con
  cifras proporcionales.

## Cosas a evitar

- Etiquetas en MAYÚSCULAS sobre los títulos, degradados de fondo decorativos y animaciones que
  se disparan solas. El foil solo se mueve al pasar el ratón, y la inclinación se desactiva con
  `prefers-reduced-motion`.
- Usar el oro o el iridiscente para cosas que no son dinero o foil.
- Las rarezas se escriben en inglés (D21); el color lo pone la marca, no el texto.

## Piezas

- `src/components/card-attributes.tsx`:
  - `<ConditionBadge>` pinta el estado con los colores de Cardmarket: MT turquesa, NM verde, EX
    verde lima, GD amarillo, LP naranja, PL rojo claro y PO rojo. El nombre completo sale al
    pasar el ratón.
  - `<LanguageFlag>` muestra el idioma con su bandera; el inglés lleva la del Reino Unido, como
    en Cardmarket.
  - Los selectores de estado e idioma también muestran el nombre y la bandera.
- `src/components/owned-card-tile.tsx`: la carta en la cuadrícula de una expansión o una
  colección. El **+** cuenta al instante (`useOptimistic`): la carta pierde el gris y el número
  sube antes de que conteste el servidor, y vuelve atrás si falla.
  - Una carta de Pokémon que también sale en reverse holo lleva dos **+**, uno encima del otro.
    El de arriba añade la «Estándar»; el de abajo, con la película foil (`.foil-button`), la
    «Reverse holo» (`quickAddFinish` en `games.ts`, 2026-09-15).
  - Cada uno dice qué acabado añade, en vez del recordado: si no, con «Foil» por defecto los dos
    harían lo mismo. Es foil de verdad, así que el iridiscente no es de adorno.
  - **Excepción: en la vista «Álbum» no sale ningún +** (`quickAdd={false}`, 2026-09-25). En un
    bolsillo los dos botones tapaban la carta y se leían como si fueran el estado de la carta, no
    acciones. Ahí el bolsillo solo se mira, y añadir copias vive en el overlay que se abre al
    tocarla, con los dos + sobre la carta grande.
  - Los dos acabados de un bolsillo se dicen con dos fichas debajo, la reverse holo con la
    película foil (`.foil-button`) y atenuada cuando no tienes ninguna. Antes era una carta
    desplazada por detrás, que con `-z-10` quedaba tapada por el fondo del panel y no se veía.
- `src/lib/use-stepped-value.ts` (`useSteppedValue`): los −/+ que guarda el servidor (copias en
  Mis cartas, copias queridas en una colección, copias en un mazo) funcionan igual.
  - El número cambia al instante, se atenúa mientras se guarda y vuelve atrás si falla.
  - Los clics se encolan, porque Next ejecuta las acciones de una en una, y cada uno parte del
    número ya cambiado.
  - Antes el botón solo se desactivaba y el número no cambiaba hasta que llegaba la página
    nueva. En Mis cartas eso tarda, así que se volvía a pulsar. En colecciones y mazos, dos
    clics seguidos guardaban el mismo número y uno se perdía (2026-09-15).
  - Lo mismo en el panel del escáner.
- `src/components/submit-button.tsx`: botón de envío que dice «Creando…» y no se puede pulsar
  dos veces. Los selectores con «+ Nueva…» hacen lo mismo. Además, el servidor reutiliza una
  colección con el mismo nombre creada hace menos de 15 segundos.
- `src/components/card-thumb.tsx`: carta con sombra; `foil` añade la película.
  - El marco no encoge en filas flexibles (`flex: none`), y la imagen lo llena en posición
    absoluta. Así se evita el recorte que hacía Safari en iOS.
  - Tampoco debe estirarse en alto. Un grupo de miniaturas dentro de una fila flexible lleva
    `items-start`: sin él, se estiraban hasta la altura de la ficha, perdían el 63:88 y la carta
    salía recortada por los lados (lista de mazos, 2026-09-15).
- `src/components/items-table-view.tsx`: las cartas de Mis cartas y de las ubicaciones.
  - En el móvil es una lista de fichas: miniatura, nombre, etiquetas, cantidad, total y el menú
    ⋯, todo a la vista.
  - Desde `md` es una tabla.
  - Una tabla ancha en el móvil escondía los detalles tras un desplazamiento lateral que no se
    veía.
- `src/components/card-fan.tsx`: cartas en abanico.
- `src/components/holo-card.tsx`: la carta grande que se inclina.
- `src/app/(app)/decks/[id]/opening-hand.tsx`: la mano de prueba de un mazo.
  - Se abre desde «Mano de prueba», junto a «Copiar lista», en una vista propia: grande en el
    ordenador y a pantalla completa en el móvil. Antes eran miniaturas de 56 px al final de la
    columna del mazo, que no se leían (2026-09-15).
  - En el ordenador, las cartas en abanico, como una mano en la mesa, con la imagen grande
    (`image_normal`) y hasta 13,5rem de ancho. Se estrechan al robar para que quepan, y la del
    puntero sube y se endereza.
  - En el móvil, una carta grande cada vez, deslizando de lado, con la siguiente asomando; los
    botones abajo, a mano del pulgar.
  - Tras un mulligan, cada carta lleva «Al fondo», en vez de tener que atinar en ella.
- `src/components/rarity-mark.tsx` y `rarityTier()` en `src/lib/games.ts`: rombo del color de la
  rareza.
- `src/components/logo.tsx`: el logo de **Tapmat**, **«Carta girada»** (D38).
  - Una carta dorada girada, como en el _tap_ de Magic, sobre su zona del tapete: el recuadro
    discontinuo que llevan los tapetes para marcar dónde va cada carta. Dibuja las dos mitades
    del nombre. La carta lleva el rombo de rareza de la app.
  - A 16 px el recuadro se pierde y queda la carta dorada inclinada, que se sigue reconociendo.
  - El nombre va en Archivo expandida (`wdth` 125) y extranegrita.
  - `<LogoMark>` es el símbolo solo y `<Logo>`, símbolo y nombre para la cabecera y la entrada.
  - Se eligió el 2026-09-14 entre Abanico (el anterior, del 2026-09-12), Carta girada y Zona de
    juego.
- `src/app/app-icon.tsx`: el icono de la app, para el móvil, la instalación y la pestaña. Es la
  carta girada sobre el tapete, con una luz suave arriba a la izquierda.
