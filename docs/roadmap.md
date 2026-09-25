# Hoja de ruta

Estado del proyecto y lo que viene. **Es orientativo:** el orden y el alcance cambian según lo
que se vaya necesitando (ver `docs/decisions.md`). Actualízalo al terminar o replantear algo.

Última actualización: 2026-09-21.

## Dónde está el proyecto

En producción, en uso real: el usuario escanea mazos enteros, comparte fotos y pregunta al
asistente. Lo que peor funciona sigue siendo **el escáner** (`docs/scanner.md`).

En Neon, a 2026-09-18: 131 157 cartas de catálogo, 56 886 nombres en español, 1 194 expansiones,
37 796 cartas con datos de juego (`oracle_cards`), 3 cuentas, 997 montones, 4 mazos, 34 fotos
compartidas, 7 días de precios guardados y 12 días de valor del inventario.

## Hecho

- **Fase 0 · Esqueleto:** Next.js 16, Drizzle, PGlite en local, Better Auth con registro cerrado,
  Vitest, ESLint y Prettier.
- **Fase 1 · Catálogo de Magic:** sincronización diaria con Scryfall (catálogo, precios y
  snapshot) y semanal (nombres en español), con sus workflows. Búsqueda sin tildes en los dos
  idiomas y ficha con todas las ediciones.
- **Fase 2 · Colecciones e inventario:** alta rápida con teclado, editar, dividir y eliminar
  montones, ±1 de cantidad, y resumen con el valor total y el progreso de cada colección.
- **Catálogo navegable** (D16): juego → expansiones → cartas, con filtros por rareza y por
  "tengo" o "me faltan", y un botón **+** para añadir.
- **Pokémon** (D17–D19): catálogo, precios de Cardmarket y nombres en español desde TCGdex,
  pestañas por serie y acabados «Estándar» y «Reverse holo».
- **Ubicaciones físicas** (D20) y **separadores** (D28): valor por ubicación, ubicación de sesión
  recordada, separadores de N cartas con modo automático, selección múltiple y «Mover a…».
- **Tus cartas y las colecciones, separadas** (D23): el inventario es lo que tienes; las
  colecciones son listas de ediciones con la cantidad que quieres, las tengas o no.
- **Evolución del valor** (D24): gráfica por días (7, 30, 90 o todo), cuánto ha cambiado solo por
  los precios, las cinco que más suben y bajan, e histórico por acabado en la ficha.
- **Gradeadas** (D27): empresa, nota y certificado, con valor estimado por copia que manda sobre
  el precio de mercado.
- **Fútbol** (D29): álbumes importados de CromosRepes (Liga 2025-26 y 2026-27 Megacracks), series
  como rarezas y lectura del nombre por la franja vertical.
- **Fotos compartidas** (D30, D32, D33): las fotos que aporta cualquiera se ven para todos,
  enderezadas y recortadas en el dispositivo, y sirven para reconocer la carta por su huella.
- **Identificar con IA** (D31): botón en el escáner que manda la foto a Claude Sonnet 5 y cruza lo
  leído con el catálogo, con límite diario.
- **Cuentas para colegas** (D34): roles `admin` y `user`, y `/admin` para crear cuentas, cambiar
  el rol, desactivarlas, **restablecer contraseñas** y ver el gasto de IA.
- **Mazos de Commander** (D35): listas por tablero, análisis (curva, tipos, colores, reglas, Game
  Changers, precio), funciones por carta, mano de prueba con mulligan, y la caja del mazo con
  «Traer a la caja» y **«Añadir a la lista lo de la caja»**.
- **Asistente** (D37): chat con Claude sobre tus propios datos, con herramientas de solo lectura,
  conversaciones guardadas y límite de gasto mensual. Desde 2026-09-15, respuestas ~⅓ más baratas
  (resultados como líneas y esquemas de herramienta reducidos).
- **Tapmat** (D38): nombre, logo «Abanico» y marca «Carta girada».

### Desde el 2026-09-15

- **Respuesta inmediata:** los −/+ cambian al instante y se corrigen si falla el servidor; los
  botones que lanzan una acción lo dicen mientras corren; capa de carga al cambiar de página; las
  funciones corren en Fráncfort, al lado de Neon.
- **Editar en bloque:** cambiar estado, idioma y acabado, o eliminar, desde la barra de selección.
- **Ficha de carta:** cambiar tus copias y sus colecciones sin salir de ella, y **«Cambiar
  expansión…»** para pasar un montón a otra edición de la misma carta.
- **Colecciones:** añadir una expansión entera a una ya creada, notas libres, vista de lista y
  mover o copiar cartas entre colecciones.
- **Ubicaciones:** notas libres, como las colecciones.
- **Alta:** el idioma por defecto es el inglés y se elige al añadir; las cartas de Pokémon con
  reverse holo tienen un segundo **+**.
- **Admin:** revisión de fotos compartidas, lista de **cartas sin imagen** que alguien tiene en
  una ubicación o colección, y **«Añadir foto» desde la propia lista**.
- **Mis cartas:** paginación con números, además de «Anterior» y «Siguiente».
- **CI en cada push:** `typecheck`, `lint` y `test` en GitHub Actions, en `main` y en cada pull
  request. Genera antes los tipos de ruta (`next typegen`), que no están en el repo.
- **De dónde sale cada precio** (D39): la ficha y las tablas distinguen tu valor estimado del
  precio de mercado, y marcan las gradeadas que se están valorando como carta suelta. En Mis
  cartas hay un filtro «Gradeadas sin valor estimado» con las que quedan por rellenar.
- **«IA automática»** en el escáner (D31): interruptor, apagado por defecto, para que la carta
  con la que el lector se atasca se mande sola a la IA en vez de esperar a que pulses. Una
  llamada por carta, y se apaga solo al llegar al límite diario.
- **Lista de «Wants»** (D23): pestaña propia junto a Colecciones y Mazos, con «Lo quiero» de un
  toque en la ficha de cualquier carta. Es una lista como las demás (`collections.kind`), así que
  trae de serie el progreso y lo que costaría conseguir lo que falta, pero no sale en los
  selectores al dar de alta ni al escanear.
- **Vista «Álbum»** en las colecciones: una tercera vista, junto a Cuadrícula y Lista, que enseña
  la colección como el binder físico — bolsillos de tres en tres, dos páginas enfrentadas en
  pantalla ancha y una en el móvil, con los bolsillos vacíos dibujados al final. Se elige entre 9
  y 12 bolsillos por página. Hereda los filtros y el progreso, pero **no el orden**: las páginas
  van siempre por número impreso, que es lo que hace que se parezca al álbum, y por eso el
  selector «Ordenar» no sale en esta vista.
  - **Normal y reverse holo comparten bolsillo**, apiladas, con la cuenta de cada acabado
    debajo: así se ve que tienes la estándar y te falta la reverse holo. Para eso la consulta
    desglosa las copias por acabado (`ownedByPrinting` las suma todas).
  - **Al tocar una carta se abre en grande**, con `HoloCard`: se inclina hacia el puntero y coge
    la luz. Solo hay una montada a la vez, así que el efecto que sería excesivo en 18 bolsillos
    aquí no cuesta nada.
  - **Se reordenan arrastrando**, con `@dnd-kit` (la primera dependencia nueva en mucho tiempo,
    elegida por el usuario porque las alternativas baratas no funcionan con el dedo). El orden se
    guarda en `collection_cards.position` (migración `0026`) y solo afecta al álbum. Arrastrar
    empieza a los 8 px, para que tocar siga abriendo la carta, y de paso se puede reordenar con
    el teclado. **Solo dentro de las dos páginas abiertas:** el resto de bolsillos no está
    montado, así que no se puede arrastrar de una página a otra.
- **Escáner** (todo en `docs/scanner.md`): la franja se lee como texto disperso, la clave de
  votación ya no confunde cartas distintas, la franja de una carta encontrada va **debajo** de su
  marco, se aceptan códigos de expansión con una letra mal, se encuentran las reimpresiones de
  **The List**, se prioriza la lista del mazo al llenar su caja, y la tira de «elige cuál es» no
  vuelve a salir tras elegir.

## Pendiente del usuario

- **Rotar la contraseña de Neon**, que pasó por el chat de una sesión. Al cambiarla, actualizar
  Vercel, el secreto de GitHub Actions y `.env.neon.local`.
- Mandar fotos de otras series de Megacracks (Élite, Special One, Vértigo, Zona VIP…) para medir
  cuántas acierta la IA (D31).
- **Lanzar una vez el sync completo de Pokémon** («Run workflow» con _full_ marcado), ya con el
  workflow arreglado el 2026-09-21. El catálogo se quedó parado el 2026-09-11 y le faltan las
  expansiones posteriores, entre ellas las dos del 30 aniversario (`30th` y `30th-c`). Tarda unos
  20 minutos. Si no, entran solas el primer miércoles tras subir el arreglo.

Ya resuelto: dominio (`tapmat.marc.beer`), cuentas en producción, `DATABASE_URL` en GitHub
Actions, `ANTHROPIC_API_KEY` en Vercel y `oracle_cards` sincronizado.

## Siguiente

### 1. Precisión del precio (D39)

La procedencia del precio ya está, y con ella el filtro que saca las 26 gradeadas sin estimar
(un tercio del valor total). Rellenarlas es cosa del usuario. Queda:

- **Campo `edition`** (ilimitada, 1ª edición, shadowless): marca y filtra; el precio sigue
  saliendo del estimado, porque no hay precio en euros por variante. Cierra el hueco de D18.
- **Banda `low`–`trend` en Pokémon:** solo para enseñarla. Ya descargamos el dato y lo tiramos.

El multiplicador por estado se descartó, con sus cuatro motivos, en D39.

### 2. Fotos reales para el escáner

Las mediciones del escáner se hacen hoy con imágenes de catálogo, y **el banco resultó inválido
dos veces**: modela mal la caja que devuelve `findCard` y no puede reproducir fallos de cámara
(reflejos, funda, enfoque, bordes negros). Llevó a descartar un arreglo correcto y a publicar uno
equivocado. Con una docena de fotos del móvil en el repo —slinger, caja, reflejo, borde negro— y
el arnés que ya existe, el escáner se mide en vez de adivinarse.

### 3. Fase 4 · Evolución del valor

Lo principal está hecho (D24). Falta:

- Beneficio o pérdida frente al precio de compra.
- El valor en el tiempo de lo que tienes de cada colección.

**Lo que lo bloquea:** no se guarda el histórico de cantidades. `price_snapshots` guarda el precio
de cada edición por día y `inventory_value_snapshots` el total de cada usuario por día, pero
`items.quantity` es solo el de hoy. Reconstruir «cuánto valían mis copias de X en julio» con la
cantidad actual da mal en cuanto compras o vendes. Hace falta guardar la cantidad junto al
snapshot, o un registro de altas y bajas.

### 4. Escáner

Estado y mediciones en `docs/scanner.md`. Lo que queda:

- **Que la votación converja:** hacen falta dos lecturas iguales, y con lecturas inestables tarda
  o no llega. Medido: ~680 ms por lectura, de los que `findCard` son ~120 y la foto 100–200.
- Comprobar en el móvil la franja nueva y la preferencia por la lista del mazo.
- Service worker (Serwist) para usarlo sin conexión.

## Más adelante / ideas

- **Sacar las fotos compartidas de Postgres** (Cloudflare R2 o Vercel Blob). Medido el
  2026-09-14: la base ocupa 230 MB de los 500 MB gratis de Neon, casi todo catálogo; cada foto
  unos 68 KB, así que con unas 4 000 fotos se llenaría.
- **Pokémon, cartas antiguas:** 1ª edición y shadowless con precio propio (hueco de D18).
- **Fútbol:** marcar por números («1, 5, 23-30, 45x2»), faltas y repes como texto para compartir,
  y un botón «Buscar imagen». Sin precio: no hay fuente.
- Importar CSV de ManaBox y otras apps.
- Filtro por expansión dentro de una colección y de Mis cartas.
- Colecciones de «cualquier edición» o por acabado, o creadas pegando una lista de nombres (D23).
- Abrir la app a más gente (D14): moderación de fotos y derechos.

## Preguntas abiertas

- **El precio no distingue idioma ni estado**, y se decidió que siga sin hacerlo: **D39** explica
  qué sí se hace (variante, procedencia, banda) y por qué el multiplicador por estado se
  descartó. Sigue abierto el precio por idioma en Pokémon, que tendría salida por
  `variants_detailed`.
- ¿Se agrupan en la navegación las expansiones hijas (tokens, promos) con su expansión padre?
