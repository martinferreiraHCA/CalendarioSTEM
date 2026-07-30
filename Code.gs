/**
 * AGENDA DEL ESPACIO — API de calendario
 *
 * Hace de puente entre el dashboard (GitHub Pages) y el Google Calendar del
 * espacio. Se despliega como Web App con "Ejecutar como: yo" y
 * "Quién tiene acceso: cualquier persona", así la tablet no necesita
 * login ni tokens que expiren.
 *
 * Endpoints
 *   GET  ?action=list&from=YYYY-MM-DD&to=YYYY-MM-DD   -> eventos del rango
 *   POST {action:'create', title, who, notes, start, end, pin}
 *        Opcional: repeat:'weekly', until:'YYYY-MM-DD' -> crea una serie
 *        semanal (p. ej. una clase fija) hasta esa fecha inclusive.
 */

var CONFIG = {
  // ID del calendario. 'primary' usa el calendario principal de tu cuenta.
  // Para un calendario del espacio: algo como
  // 'c_abc123@group.calendar.google.com' (Configuración del calendario > ID).
  CALENDAR_ID: 'stem@hca.edu.uy',

  // Mismo valor que CONFIG.PIN en index.html. '' = sin código.
  PIN: '',

  // Horario en que se aceptan reservas (bloquea creaciones fuera de rango).
  OPEN_HOUR: 7,
  CLOSE_HOUR: 19,

  // Ruido que no debe llegar al dashboard.
  HIDE_ALL_DAY: true,          // ocultar los eventos de todo el día
  HIDE_TITLES: ['Office'],     // ocultar por título exacto (ignora mayúsculas)

  MAX_DAYS_AHEAD: 120,     // no se puede reservar más allá de esto
  MAX_MINUTES: 480,        // duración máxima de una reserva
  BLOCK_OVERLAP: true,     // rechazar si se superpone con otra reserva
  ALLOW_PAST: false,       // permitir crear en el pasado

  // Prefijo con el que se guarda quién reserva, en la descripción del evento.
  WHO_LABEL: 'Reserva a nombre de:'
};

/* ------------------------------------------------------------------ */

function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    if (p.action === 'list' || !p.action) {
      return json(listEvents_(p.from, p.to));
    }
    return json({ ok: false, error: 'Acción desconocida' });
  } catch (err) {
    return json({ ok: false, error: String(err && err.message || err) });
  }
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (body.action === 'create') return json(createEvent_(body));
    return json({ ok: false, error: 'Acción desconocida' });
  } catch (err) {
    return json({ ok: false, error: String(err && err.message || err) });
  }
}

/* ------------------------------------------------------------------ */

function cal_() {
  var c = CONFIG.CALENDAR_ID === 'primary'
    ? CalendarApp.getDefaultCalendar()
    : CalendarApp.getCalendarById(CONFIG.CALENDAR_ID);
  if (!c) throw new Error('No encuentro el calendario ' + CONFIG.CALENDAR_ID);
  return c;
}

function tz_() {
  return cal_().getTimeZone() || Session.getScriptTimeZone();
}

function listEvents_(from, to) {
  var tz = tz_();
  var start = from ? parseDay_(from, tz) : new Date();
  var end = to ? parseDay_(to, tz) : new Date(start.getTime() + 7 * 864e5);
  end = new Date(end.getTime() + 864e5); // 'to' inclusive

  var raw = cal_().getEvents(start, end);
  var out = [];

  var mute = (CONFIG.HIDE_TITLES || []).map(function (t) {
    return String(t).toLowerCase().trim();
  });

  for (var i = 0; i < raw.length; i++) {
    var ev = raw[i];
    if (CONFIG.HIDE_ALL_DAY && ev.isAllDayEvent()) continue;
    if (mute.indexOf(ev.getTitle().toLowerCase().trim()) !== -1) continue;
    var desc = ev.getDescription() || '';
    out.push({
      id: ev.getId(),
      title: ev.getTitle(),
      start: ev.getStartTime().toISOString(),
      end: ev.getEndTime().toISOString(),
      allDay: ev.isAllDayEvent(),
      location: ev.getLocation() || '',
      who: extractWho_(desc)
    });
  }

  return { ok: true, tz: tz, now: new Date().toISOString(), events: out };
}

function createEvent_(b) {
  if (CONFIG.PIN && String(b.pin || '') !== String(CONFIG.PIN)) {
    return { ok: false, error: 'código de gestión incorrecto' };
  }

  var title = String(b.title || '').trim();
  if (!title) return { ok: false, error: 'falta el nombre de la actividad' };

  var tz = tz_();
  var start = parseStamp_(b.start, tz);
  var end = parseStamp_(b.end, tz);
  if (!start || !end) return { ok: false, error: 'fechas inválidas' };
  if (end <= start) return { ok: false, error: 'la hora de fin va antes del inicio' };

  var mins = (end - start) / 60000;
  if (mins > CONFIG.MAX_MINUTES) {
    return { ok: false, error: 'la reserva supera el máximo de ' + (CONFIG.MAX_MINUTES / 60) + ' h' };
  }

  var now = new Date();
  if (!CONFIG.ALLOW_PAST && end < now) {
    return { ok: false, error: 'ese horario ya pasó' };
  }
  if ((start - now) / 864e5 > CONFIG.MAX_DAYS_AHEAD) {
    return { ok: false, error: 'no se puede reservar con tanta anticipación' };
  }

  // Repetición semanal (clases fijas): hasta 'until' inclusive.
  var weekly = b.repeat === 'weekly';
  var until = null;
  if (weekly) {
    until = b.until ? parseDay_(b.until, tz) : null;
    if (!until) until = parseDay_(start.getFullYear() + '-12-31', tz);
    until = new Date(until.getTime() + 864e5 - 1); // fin de ese día
    if (until < start) return { ok: false, error: 'la fecha de fin de la repetición ya pasó' };
  }

  var h = Number(Utilities.formatDate(start, tz, 'H'));
  var hEnd = Number(Utilities.formatDate(end, tz, 'H'));
  var mEnd = Number(Utilities.formatDate(end, tz, 'm'));
  if (h < CONFIG.OPEN_HOUR || hEnd > CONFIG.CLOSE_HOUR || (hEnd === CONFIG.CLOSE_HOUR && mEnd > 0)) {
    return { ok: false, error: 'el espacio abre de ' + CONFIG.OPEN_HOUR + ' a ' + CONFIG.CLOSE_HOUR + ' h' };
  }

  var c = cal_();

  if (CONFIG.BLOCK_OVERLAP) {
    // Para una serie semanal se revisa cada ocurrencia hasta 'until'.
    var week = 7 * 864e5;
    var s = start, e = end;
    while (s <= (weekly ? until : start)) {
      var clash = c.getEvents(s, e).filter(function (ev) {
        return !ev.isAllDayEvent() && ev.getStartTime() < e && ev.getEndTime() > s;
      });
      if (clash.length) {
        var label = clash[0].getTitle();
        if (weekly) label += ' (el ' + Utilities.formatDate(s, tz, 'dd/MM') + ')';
        return { ok: false, error: 'horario ocupado', conflict: label };
      }
      if (!weekly) break;
      s = new Date(s.getTime() + week);
      e = new Date(e.getTime() + week);
    }
  }

  var who = String(b.who || '').trim();
  var notes = String(b.notes || '').trim();
  var desc = [];
  if (who) desc.push(CONFIG.WHO_LABEL + ' ' + who);
  if (notes) desc.push(notes);
  if (weekly) {
    desc.push('Clase semanal hasta el ' + Utilities.formatDate(until, tz, 'dd/MM/yyyy'));
  }
  desc.push('Cargada desde la tablet del espacio el ' +
            Utilities.formatDate(now, tz, 'dd/MM/yyyy HH:mm'));

  if (weekly) {
    var series = c.createEventSeries(
      title, start, end,
      CalendarApp.newRecurrence().addWeeklyRule().until(until),
      { description: desc.join('\n') }
    );
    return { ok: true, event: { id: series.getId(), title: series.getTitle(), who: who } };
  }

  var ev = c.createEvent(title, start, end, { description: desc.join('\n') });

  return {
    ok: true,
    event: {
      id: ev.getId(),
      title: ev.getTitle(),
      start: ev.getStartTime().toISOString(),
      end: ev.getEndTime().toISOString(),
      who: who
    }
  };
}

/* ------------------------------------------------------------------ */

function extractWho_(desc) {
  var lines = String(desc).split('\n');
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].indexOf(CONFIG.WHO_LABEL) === 0) {
      return lines[i].slice(CONFIG.WHO_LABEL.length).trim();
    }
  }
  return '';
}

function parseDay_(s, tz) {
  return Utilities.parseDate(String(s) + ' 00:00:00', tz, 'yyyy-MM-dd HH:mm:ss');
}

function parseStamp_(s, tz) {
  s = String(s || '').replace('T', ' ');
  if (s.length === 16) s += ':00';
  try {
    return Utilities.parseDate(s, tz, 'yyyy-MM-dd HH:mm:ss');
  } catch (err) {
    return null;
  }
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ------------------------------------------------------------------ */

/** Corré esto una vez desde el editor para probar el acceso al calendario. */
function testCalendar() {
  var c = cal_();
  Logger.log('Calendario: %s (%s)', c.getName(), c.getTimeZone());
  var r = listEvents_(
    Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd'),
    Utilities.formatDate(new Date(Date.now() + 7 * 864e5), tz_(), 'yyyy-MM-dd')
  );
  Logger.log('Eventos en 7 días: %s', r.events.length);
  Logger.log(JSON.stringify(r.events.slice(0, 5), null, 2));
}
