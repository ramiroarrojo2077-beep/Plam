# Cinco Noches en Bruno's

Juego de terror en **tiempo real** inspirado en *Five Nights at Freddy's*, hecho desde cero con
[Three.js](https://threejs.org/). Todo es procedural: modelos, texturas, animaciones y sonido se generan
en el navegador, sin un solo archivo de imagen, modelo o audio externo.

## Cómo jugar

**Lo más fácil:** descarga [`cinco-noches.html`](cinco-noches.html) y ábrelo con doble clic en Chrome, Edge o Firefox.
Es un único archivo con todo incrustado (código, Three.js y estilos): no necesita npm ni servidor.

Para desarrollar:

```bash
npm install
npm run dev          # abre http://localhost:5173
npm run build:html   # regenera cinco-noches.html (archivo único)
```

`npm run build` genera la versión en varios archivos en `dist/` para cualquier hosting estático.

### Controles

| Acción | Teclado / ratón |
| --- | --- |
| Mirar a izquierda / derecha | `A` / `D`, flechas, o llevar el ratón al borde de la pantalla |
| Puerta izquierda / derecha | `Q` / `E`, o clic en el botón rojo de cada panel |
| Luz izquierda / derecha | `Z` / `C`, o clic en el botón blanco |
| Subir / bajar el monitor | `S` / `Espacio`, o pasar el ratón por la barra inferior |
| Cambiar de cámara | clic en el mapa, `1`-`9`, `0`, `-`, o flechas arriba/abajo |
| Pausa | `Esc` |

En pantallas táctiles aparecen botones de puertas y luces; se gira arrastrando.

### Reglas

Sobrevive de 12 AM a 6 AM (cada hora dura 60 s por defecto; configurable). Cada puerta cerrada, cada luz y el
monitor consumen energía. Si se acaba, se apaga todo... y Bruno viene a cantarte.

- **Bastián** (conejo) recorre el ala oeste y aparece en la puerta izquierda.
- **Chiqui** (pollo) pasa por la cocina (solo audio) y los baños, y llega por el ala este.
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
- **Animación procedural**: servos con velocidad angular limitada, ciclo de caminar y correr con contacto de pies,
  mirada coordinada de cuello/cabeza/ojos hacia la cámara que los observa, espasmos mecánicos, parpadeo y
  mandíbula; susto con embestida y temblor.
- **Render**: PBR, sombras PCF suaves, ACES, bloom, SMAA y una pasada final con grano, viñeta, aberración
  cromática y efecto VHS. Las luces se gestionan con un *pool* fijo que se reasigna por vista, para que los shaders
  no se recompilen al cambiar de cámara.
- **Audio**: todo sintetizado con Web Audio (pasos, portazos, zumbidos, grito, caja de música con la *Marcha del
  Toreador* de Bizet, dominio público). La llamada telefónica usa la síntesis de voz del navegador (desactivable).

## Estructura

```
src/
  main.js              estados del juego, vistas, entrada, sustos, menú y galería
  core/                texturas procedurales, materiales, geometría, audio, post-procesado
  world/               plano, arquitectura, atrezo, oficina, iluminación
  animatronics/        esqueleto/animación (rig.js) y modelado (models.js)
  game/                noche (reglas), IA, navegación, llamadas
  ui/                  HUD, monitor y mapa de cámaras
```

Proyecto de fans sin relación con Scott Cawthon ni con la franquicia original. Personajes y nombres originales.
