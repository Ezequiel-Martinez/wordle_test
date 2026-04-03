Patron de Palabras

Aplicacion minima para un experimento tipo Wordle de 5 letras con tres condiciones:

- `curiosity`
- `utility`
- `loss_aversion`

La sesion usa 5 rondas obligatorias y 2 opcionales. Las palabras objetivo salen de `palabras_clave.txt` en el mismo orden en que aparecen escritas.

La app carga `words.txt` para validar inputs.

La app esta lista para:

- hosting estatico local
- GitHub Pages
- Firebase Realtime Database

Los registros de Firebase se escriben en:

```text
open_the_lock_sessions/{session_id}
```

Configuracion local de Firebase

1. Copia `firebase-config.example.js` a `firebase-config.js`
2. Completa ahi tu configuracion real de Firebase
3. No subas `firebase-config.js` al repo

Importante

- `firebase-config.js` queda fuera del repo, pero si la app se sirve al navegador ese archivo sigue siendo visible para cualquier persona que abra el sitio
- en una app puramente cliente, la proteccion real no depende de ocultar ese archivo sino de las reglas de Firebase, autenticacion y, si hace falta, un backend propio
