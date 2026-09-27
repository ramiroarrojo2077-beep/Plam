# Cinco Noches en Bruno's

Juego de terror en **tiempo real** inspirado en *Five Nights at Freddy's*, hecho desde cero con
[Three.js](https://threejs.org/). Todo es procedural: modelos, texturas, animaciones y sonido se generan
en el navegador, sin un solo archivo de imagen, modelo o audio externo.

## Cómo jugar

**Lo más fácil:** descarga [`index.html`](index.html) y ábrelo con doble clic en Chrome, Edge o Firefox.
Es un único archivo con todo incrustado (código, Three.js y estilos): no necesita npm ni servidor.

Para desarrollar:

```bash
npm install
npm run dev          # abre http://localhost:5173/dev.html (código fuente con recarga en caliente)
npm run build:html   # regenera index.html (archivo único)
```

`npm run build` genera la versión en varios archivos en `dist/` para cualquier hosting estático.

### Android (APK)

Descarga [`apk/CincoNochesEnBrunos.apk`](apk/CincoNochesEnBrunos.apk) en el móvil, ábrelo y acepta
"instalar apps de origen desconocido". Requiere Android 7.0 o superior con WebView actualizado (WebGL 2).
Se juega a pantalla completa y en horizontal; el botón atrás pausa la noche o vuelve al menú.

Para regenerarlo (Java 17+, python3 y acceso a Maven Central):

```bash
npm run build:html   # primero el index.html
npm run build:apk    # android/ -> apk/CincoNochesEnBrunos.apk
```

El script descarga aapt2, las clases de Android, dx y apksig desde Maven Central (en `android/.tools`) y
firma con `android/brunos.keystore` (contraseña `cinconoches`), una clave para instalar a mano; para
publicarlo en Google Play habría que firmar con una clave propia (otro keystore y `KS_PASS`).

### Controles

| Acción | Teclado / ratón |
| --- | --- |
| Mirar a izquierda / derecha | `A` / `D`, flechas, o llevar el ratón al borde de la pantalla |
| Puerta izquierda / derecha | `Q` / `E`, o clic en el botón rojo de cada panel |
| Luz izquierda / derecha | `Z` / `C`, o clic en el botón blanco |
| Subir / bajar el monitor | `S` / `Espacio`, o pasar el ratón por la barra inferior |
| Cambiar de cámara | clic en el mapa, `1`-`9`, `0`, o flechas arriba/abajo |
| Pausa | `Esc` |

En pantallas táctiles aparecen botones de puertas y luces; se gira arrastrando.

### Reglas

Sobrevive de 12 AM a 6 AM (cada hora dura 60 s por defecto; configurable). Cada puerta cerrada, cada luz y el
monitor consumen energía. Si se acaba, se apaga todo... y Bruno viene a cantarte.

- **Bastián** (conejo) recorre el ala oeste y aparece en la puerta izquierda.
- **Chiqui** (pollo) pasa por la cocina (no tiene cámara: solo se la oye) y los baños, y llega por el ala este.
- **Bruno** (oso) solo se mueve cuando los otros dos han dejado el escenario, evita las cámaras y ataca por la derecha.
- **Rufo** (zorro) sale de la Cueva Pirata si no lo vigilas y corre por el pasillo oeste: ciérrale la puerta.

Hay cinco noches, una sexta desbloqueable, noche personalizada (niveles de IA 0-20) y una **galería** para ver
los animatrónicos de cerca con todas sus animaciones.

## Qué lo hace "tiempo real"

- El edificio entero existe en 3D. Las cámaras de seguridad renderizan la escena real en directo, con su propio
  barrido, distorsión de lente, líneas de escaneo y estática.
- Los animatrónicos **caminan de verdad** por el local siguiendo un grafo de navegación (Dijkstra): puedes verlos
  moverse por las cámaras y oír sus pasos posicionales (HRTF) acercarse por el pasillo. Rufo corre por el pasillo
  oeste en directo si lo miras en la cámara 2A.
- Las reglas de IA siguen las del original (oportunidades de movimiento periódicas con tirada 1-20 frente a su nivel),
  pero el desplazamiento entre salas es físico.

## Técnica

- **Animatrónicos**: esculpidos a partir de esferas deformadas, tornos y tubos; esqueleto articulado (cadera,
  columna, pecho, cuello, cabeza, mandíbula, hombros, codos, muñecas, dedos con 3 falanges, piernas, orejas,
  párpados). Pelaje con `MeshPhysicalMaterial` (sheen), mapas de normales de fibras, suciedad por vértice y
  endoesqueleto metálico visible (cuello con fuelle, servos en codos y rodillas; Rufo tiene el traje roto).
- **Animación procedural**: servos con muelle subamortiguado (inercia y pequeño rebote al frenar), ciclo de
  caminar y correr con impacto de talón y brazos con retraso, pasos al girar en el sitio, movimiento secundario
  (cabeza, orejas y mandíbula reaccionan a la aceleración y a cada pisada), sacadas oculares, actuaciones en el
  escenario (Bruno canta, Bastián toca, Chiqui saluda), acecho en la puerta y sustos distintos por personaje.
- **Render**: PBR con sondas de reflexión capturadas del propio local (reflejos en suelo, ojos y metal, y luz
  rebotada), niebla, haces de luz volumétricos con polvo en suspensión, manchas, charcos y telarañas, sombras PCF,
  oclusión ambiental (GTAO), profundidad de campo en el menú y la galería, ACES, bloom, SMAA y una pasada final con
  grano, viñeta, aberración cromática y efecto VHS. Las luces se gestionan con un *pool* fijo que se reasigna por
  vista, para que los shaders no se recompilen al cambiar de cámara.
- **Audio**: todo sintetizado con Web Audio (pasos, portazos, zumbidos, grito, caja de música con la *Marcha del
  Toreador* de Bizet, dominio público). La llamada telefónica usa la síntesis de voz del navegador (desactivable).

## Estructura

```
src/
  main.js              estados del juego, vistas, entrada, sustos, menú y galería
dev.html               entrada de desarrollo (index.html es el juego ya compilado en un archivo)
  core/                texturas procedurales, materiales, geometría, audio, post-procesado
  world/               plano, arquitectura, atrezo, oficina, iluminación
  animatronics/        esqueleto/animación (rig.js) y modelado (models.js)
  game/                noche (reglas), IA, navegación, llamadas
  ui/                  HUD, monitor y mapa de cámaras
```

Proyecto de fans sin relación con Scott Cawthon ni con la franquicia original. Personajes y nombres originales.
