import type { Booking, Room } from '../types/booking';

function toGoogleCalendarUtcStamp(dateStr: string, timeStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  const dt = new Date(y, m - 1, d, hh, mm, 0);
  return dt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Builds a login-free "Add to Google Calendar" URL so users can save any room booking
 * directly to their Google Calendar without OAuth login inside this app.
 */
export function buildGoogleCalendarTemplateUrl(booking: Booking, room?: Room): string {
  const start = toGoogleCalendarUtcStamp(booking.date, booking.startTime);
  const end = toGoogleCalendarUtcStamp(booking.date, booking.endTime);
  const title = room ? `[${room.code} · ${room.name}] ${booking.title}` : booking.title;
  const location = room ? `${room.name} (${room.code})` : 'Ruang Meeting Kantor';
  const details = [
    booking.description || 'Reservasi ruang meeting kantor.',
    '',
    `Penanggung Jawab: ${booking.organizerName} (${booking.organizerEmail})`,
    booking.attendees.length > 0 ? `Peserta: ${booking.attendees.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${start}/${end}`,
    details,
    location,
  });

  if (booking.attendees.length > 0) {
    params.set('add', booking.attendees.join(','));
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
