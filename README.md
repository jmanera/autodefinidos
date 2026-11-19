# Autodefinidos

Pasatiempo de autodefinidos (crucigramas con las definiciones dentro de la cuadrícula) para
tablet Android. Es una página web (`app/assets/`) envuelta en una app Android mínima con un
WebView a pantalla completa. Funciona sin conexión.

## Descargar

La última versión firmada está en [Releases](https://github.com/jmanera/autodefinidos/releases/latest): descarga `Autodefinidos.apk` y ábrelo
en la tablet (la primera vez hay que permitir instalar aplicaciones de origen desconocido), o
instálalo con `adb install -r Autodefinidos.apk`.

## Compilar e instalar desde el código

Con la tablet conectada por USB y la depuración USB activada:

```bash
./build.sh
adb install -r Autodefinidos.apk
```

`build.sh` pasa primero las pruebas (`node tools/test.js`) y compila sin Gradle (usa `aapt2`,
`javac`, `d8` y `apksigner` del SDK en `~/Android/Sdk`). La primera vez crea `release.keystore`
(no se sube al repo): guárdalo, porque para actualizar la app sin desinstalarla (y sin perder
estadísticas ni la partida guardada) hay que firmar siempre con la misma clave.

## Qué incluye

- Autodefinidos generados al momento en tres tamaños: pequeño (9×7), mediano (11×8) y grande (13×9).
  Cada uno tiene un número; el mismo número y tamaño dan siempre el mismo tablero.
- Autodefinido del día, igual durante todo el día, con racha de días seguidos.
- Diccionario propio de unas 2.300 palabras con sus definiciones, escritas para este juego:
  palabras corrientes, verbos, símbolos químicos, números romanos, notas musicales, letras…
- Teclado en pantalla con Ñ (se puede ocultar si se usa un teclado físico).
- Panel con la definición completa de la palabra actual y la de la que se cruza.
- Ayudas: comprobar letra, palabra o todo; revelar letra o palabra; resolver; borrar errores.
  Opción de comprobar al escribir.
- Tiempo, porcentaje hecho, estadísticas por tamaño (jugados, hechos, sin ayuda, mejor tiempo, media).
- Temas claro, sepia y oscuro; tres tamaños de letra para las definiciones.
- La partida se guarda sola y se recupera en pausa.
- En Android: pantalla completa, pantalla siempre encendida, horizontal o vertical, y el botón
  atrás cierra ventanas o quita la pausa antes de salir.

## Cómo se genera un tablero

`app/assets/gen.js` rellena la cuadrícula casilla a casilla, por filas. La fila 0 y la columna 0
son casillas de definición; en el interior decide en cada casilla si va una letra o una
definición. Un trie con el diccionario comprueba que cada tramo horizontal y vertical siga siendo
el comienzo de alguna palabra y que pueda terminar antes del borde. Si se atasca, vuelve atrás;
si tarda demasiado, empieza otro intento. No repite palabras en un tablero, no deja letras que no
pertenezcan a ninguna palabra y no deja casillas de definición vacías en el interior.

## Estructura

| Ruta | Contenido |
| --- | --- |
| `app/assets/dict/*.js` | Diccionario: una línea por palabra, `PALABRA:pista|otra pista`. |
| `app/assets/gen.js` | Generador (sin DOM, se prueba con Node). |
| `app/assets/app.js` | Interfaz: dibujo en canvas, teclado, ayudas, ventanas, ajustes, estadísticas y guardado. |
| `app/src/.../MainActivity.java` | Envoltorio Android (WebView). |
| `tools/test.js` | Comprobaciones del diccionario y de 120 tableros generados. |

Para añadir palabras basta con escribir más líneas en cualquier fichero de `app/assets/dict/`
(sin tildes en la palabra; la pista sí las lleva). Las pruebas avisan si una pista contiene su
propia respuesta.

## Probar en el ordenador

```bash
python3 -m http.server 8766 -d app/assets
```

Y abrir `http://localhost:8766`. Con teclado físico: letras para escribir, flechas para moverse,
espacio para cambiar de dirección, Tab o Intro para pasar a la siguiente definición, Esc para pausar.

## Publicar una versión

El workflow [Publicar APK](.github/workflows/release.yml) compila el APK firmado y crea una release
nueva (`v1.N`). Solo se lanza a mano, desde *Actions > Publicar APK > Run workflow*, y solo lo puede
ejecutar el dueño del repositorio. Firma con la misma clave que `release.keystore`, guardada en el
secreto `KEYSTORE_BASE64` (el fichero en base64):

```bash
base64 -w0 release.keystore | gh secret set KEYSTORE_BASE64
```

## Otros juegos

Hechos de la misma forma, para la misma tablet:

- [Mahjong solitario](https://github.com/jmanera/mahjong-solitario): emparejar fichas, con 12 tableros.
- [Sopa de letras](https://github.com/jmanera/sopa-de-letras): sopas de letras por temas.
- [Abecedario](https://github.com/jmanera/abecedario): una definición por letra contra el reloj, para uno o varios jugadores.
- [Zampabolas](https://github.com/jmanera/zampabolas): juego de laberinto con varios mundos (clásico, Navidad, bosque, carreras) y personajes.
