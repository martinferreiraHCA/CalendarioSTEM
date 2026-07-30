# Agenda del espacio

Dashboard de calendario para gestionar un espacio desde una tablet vieja en modo kiosco.
Vista semanal lineal y vista mensual, blanco y negro, sin dependencias externas.
Los datos viven en un Google Calendar; se pueden cargar reservas nuevas desde la tablet.

```
   [ Tablet ]  ──GET/POST──▶  [ Apps Script Web App ]  ──▶  [ Google Calendar ]
   index.html                  Code.gs
   GitHub Pages                corre con tu cuenta
```

La tablet no guarda credenciales y no tiene que loguearse: el script accede al
calendario con tu cuenta. Eso es lo que permite dejarlo prendido todo el día.

---

## 1. Publicar la API (Apps Script)

1. Entrá a <https://script.google.com> → **Nuevo proyecto**.
2. Borrá lo que haya y pegá el contenido de `Code.gs`.
3. Arriba del archivo, en `CONFIG`, poné el `CALENDAR_ID`:
   - `'primary'` para tu calendario principal, o
   - el ID del calendario del espacio: en Google Calendar, tres puntos junto al
     calendario → *Configuración y uso compartido* → **ID del calendario**
     (tiene forma `c_algo@group.calendar.google.com`).
4. Ajustá `OPEN_HOUR` y `CLOSE_HOUR` al horario real del espacio.
5. Ejecutá una vez la función `testCalendar` y aceptá los permisos. En el
   registro tienen que aparecer el nombre del calendario y los eventos de la semana.
6. **Implementar → Nueva implementación → Aplicación web**:
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier persona**
7. Copiá la URL que termina en `/exec`.

> Cada vez que cambies `Code.gs` tenés que **Implementar → Administrar
> implementaciones → editar → Versión: nueva**. Si no, la tablet sigue viendo
> la versión anterior.

## 2. Configurar el dashboard

En `index.html`, bloque `CONFIG` (arriba del `<script>`):

| Clave | Para qué |
|---|---|
| `API_URL` | La URL `/exec` del paso anterior |
| `SPACE_NAME` | Lo que se lee en el encabezado |
| `PIN` | Código para poder guardar reservas. `''` = sin código |
| `OPEN_HOUR` / `CLOSE_HOUR` | Horas que ofrece el selector |
| `SLOT_MINUTES` | Granularidad del selector de hora |
| `REFRESH_MS` | Cada cuánto relee el calendario (3 min) |
| `IDLE_RESET_MS` | Sin tocar la pantalla, vuelve a la semana actual (90 s) |
| `SHOW_MONTH_ON_IDLE` | `true` si querés que la vista de reposo sea el mes |

El `PIN` de `index.html` y el de `Code.gs` tienen que coincidir. El de
`index.html` es solo comodidad: la validación que cuenta es la del script.

## 3. Subir a GitHub Pages

```bash
git init
git add index.html README.md Code.gs
git commit -m "Agenda del espacio"
git branch -M main
git remote add origin git@github.com:USUARIO/agenda-espacio.git
git push -u origin main
```

En el repo: **Settings → Pages → Source: Deploy from a branch → main / (root)**.
Un minuto después queda en `https://USUARIO.github.io/agenda-espacio/`.

## 4. Dejar la tablet en kiosco

1. Abrí la URL en Chrome y agregala a la pantalla de inicio
   (*Añadir a pantalla principal*): arranca sin barra de direcciones.
2. **Ajustes → Pantalla → Suspensión: nunca**, y brillo bajo para no quemar el panel.
3. **Ajustes → Opciones de desarrollador → Permanecer activo mientras se carga**,
   y dejala enchufada.
4. Si querés bloquear la salida de la app: *Fully Kiosk Browser* (gratis para lo
   básico) o el **anclaje de pantalla** de Android.
5. Si la tablet es muy vieja, actualizá Chrome desde Play Store antes de probar.
   El dashboard usa `fetch` (Chrome 42+) y tabla HTML en la vista mensual justamente
   para no depender de CSS Grid.

---

## Cómo se comporta en pantalla

- **Semana**: siete filas de lunes a domingo. El día de hoy va con la columna
  izquierda invertida; la actividad en curso va en negro pleno; lo que ya pasó
  queda atenuado. Los días sin nada dicen *Libre*.
- **Mes**: grilla con hasta tres actividades por día y `+N más`.
- **Reposo**: a los 90 s sin tocar vuelve sola a la semana actual, así nadie
  la deja abandonada en marzo.
- **Cambio de día**: a medianoche reencuadra sola.
- **Sin conexión**: el pie se pone negro y avisa; sigue mostrando lo último que leyó.

## Reservas

El botón **+ Reservar** pide actividad, a nombre de quién, día, hora de inicio y
duración. El día se elige con botones grandes (Hoy, Mañana, y los próximos días),
no con date picker, porque en pantallas viejas es un dolor.

El script rechaza reservas que se superpongan con algo existente y devuelve con
qué chocan, para que se vea en la tablet. Los eventos de todo el día no bloquean.

## Cosas que faltan a propósito

Para una v1 en kiosco dejé afuera: editar o cancelar desde la tablet (cualquiera
que pase podría borrar una reserva; conviene hacerlo desde Google Calendar),
múltiples salas o recursos, y notificaciones. Todo eso entra bien encima de esta
base cuando lo necesites.
