Patron de Palabras

Aplicacion minima para un experimento tipo Wordle de 6 letras con tres condiciones:

- `curiosity`
- `utility`
- `loss_aversion`

La sesion usa 6 rondas obligatorias y 2 opcionales. Las palabras objetivo comparten una categoria semantica comun para favorecer la condicion `curiosity`.

La app carga `words.txt` para validar inputs y usa una secuencia fija de palabras objetivo de 6 letras.

La app esta lista para:

- hosting estatico local
- GitHub Pages
- Firebase Realtime Database

Los registros de Firebase se escriben en:

```text
open_the_lock_sessions/{session_id}
```
