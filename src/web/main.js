// Punto de entrada del frontend de TayGameStore.
// Orden de ejecución idéntico al de los scripts del HTML original:
// compatibilidad → tienda → capa visual → capa cinematográfica → pausa fuera de pantalla.
import './js/compat.js';
import { startStore } from './js/store/app.js';
import { initCinematicEffects } from './js/effects/cinematic.js';
import { initVisualEffects } from './js/effects/visual.js';
import { pauseOffscreenAnimations } from './js/effects/offscreen.js';

startStore();
initVisualEffects();
initCinematicEffects();
pauseOffscreenAnimations();
