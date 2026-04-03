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
