import express from 'express';
import type { Request, Response } from 'express';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_SUPABASE_URL = 'https://rvcwuavtufabscutmwua.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ2Y3d1YXZ0dWZhYnNjdXRtd3VhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk5NTM1MzgsImV4cCI6MjA4NTUyOTUzOH0.4lGc67f122ZMZ0b7FXCO6mLlIJveG82ADxB6JzSiV7E';

function sanitizeSupabaseUrl(raw?: string): string {
  if (!raw) return DEFAULT_SUPABASE_URL;
  const cleaned = raw.trim().replace(/^[\[\("']+/, '').replace(/[\]\)"']+$/, '');
  try {
    const parsed = new URL(cleaned);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString().replace(/\/+$/, '');
    }
  } catch {
    // Fallback to verified Supabase URL
  }
  return DEFAULT_SUPABASE_URL;
}

function selectSupabaseKey(): string {
  const candidates = [
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.SUPABASE_ANON_KEY,
  ];
  for (const c of candidates) {
    if (!c) continue;
    const trimmed = c.trim();
    if (
      trimmed.length > 20 &&
      !trimmed.includes('MASUKKAN') &&
      !trimmed.startsWith('MY_')
    ) {
      return trimmed;
    }
  }
  return DEFAULT_SUPABASE_ANON_KEY;
}

const SUPABASE_URL = sanitizeSupabaseUrl(process.env.SUPABASE_URL);
const SUPABASE_KEY = selectSupabaseKey();

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

interface Room {
  id: string;
  code: string;
  name: string;
  floor: string;
  capacity: number;
  amenities: string[];
  description: string;
}

type BookingStatus = 'confirmed' | 'cancelled';

interface Booking {
  id: string;
  roomId: string;
  title: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  organizerName: string;
  organizerEmail: string;
  attendees: string[];
  status: BookingStatus;
  reminderMinutes: number;
  reminderSent: boolean;
  createdAt: string;
  updatedAt: string;
}

type NotificationType =
  | 'booking_created'
  | 'booking_updated'
  | 'booking_cancelled'
  | 'meeting_reminder'
  | 'system_test';

interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  bookingId?: string;
  roomName?: string;
  meetingDate?: string;
  meetingTime?: string;
  read: boolean;
  createdAt: string;
  channels: {
    inApp: boolean;
    attendeeCount: number;
    reminderScheduledMinutes?: number;
  };
}

interface NotificationSettings {
  reminderMinutesBefore: number;
  desktopAlerts: boolean;
  notifyOnCancellation: boolean;
}

interface DbRoomRow {
  id: string;
  code: string;
  name: string;
  floor: string;
  capacity: number;
  amenities: string[] | null;
  description: string | null;
}

interface DbBookingRow {
  id: string;
  room_id: string;
  title: string;
  description: string | null;
  date: string;
  start_time: string;
  end_time: string;
  organizer_name: string;
  organizer_email: string;
  attendees: string[] | null;
  status: string;
  reminder_minutes: number;
  reminder_sent: boolean;
  created_at: string;
  updated_at: string;
}

interface DbNotificationRow {
  id: string;
  type: string;
  title: string;
  message: string;
  booking_id: string | null;
  room_name: string | null;
  meeting_date: string | null;
  meeting_time: string | null;
  read: boolean;
  channels: {
    inApp?: boolean;
    attendeeCount?: number;
    reminderScheduledMinutes?: number;
  } | null;
  created_at: string;
}

interface DbSettingsRow {
  id: number;
  reminder_minutes_before: number;
  desktop_alerts: boolean;
  notify_on_cancellation: boolean;
}

// Graceful fallback store for notifications/settings if RLS blocks those tables
let fallbackNotifications: NotificationItem[] = [];
let fallbackSettings: NotificationSettings = {
  reminderMinutesBefore: 15,
  desktopAlerts: false,
  notifyOnCancellation: true,
};

function mapRoomRow(row: DbRoomRow): Room {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    floor: row.floor,
    capacity: row.capacity,
    amenities: Array.isArray(row.amenities) ? row.amenities : [],
    description: row.description || '',
  };
}

function mapBookingRow(row: DbBookingRow): Booking {
  return {
    id: row.id,
    roomId: row.room_id,
    title: row.title,
    description: row.description || '',
    date: row.date,
    startTime: row.start_time,
    endTime: row.end_time,
    organizerName: row.organizer_name,
    organizerEmail: row.organizer_email,
    attendees: Array.isArray(row.attendees) ? row.attendees : [],
    status: (row.status === 'cancelled' ? 'cancelled' : 'confirmed') as BookingStatus,
    reminderMinutes: row.reminder_minutes,
    reminderSent: row.reminder_sent,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapNotificationRow(row: DbNotificationRow): NotificationItem {
  return {
    id: row.id,
    type: row.type as NotificationType,
    title: row.title,
    message: row.message,
    bookingId: row.booking_id ?? undefined,
    roomName: row.room_name ?? undefined,
    meetingDate: row.meeting_date ?? undefined,
    meetingTime: row.meeting_time ?? undefined,
    read: row.read,
    createdAt: row.created_at,
    channels: {
      inApp: row.channels?.inApp ?? true,
      attendeeCount: row.channels?.attendeeCount ?? 0,
      reminderScheduledMinutes: row.channels?.reminderScheduledMinutes,
    },
  };
}

function mapSettingsRow(row?: DbSettingsRow | null): NotificationSettings {
  return {
    reminderMinutesBefore: row?.reminder_minutes_before ?? fallbackSettings.reminderMinutesBefore,
    desktopAlerts: row?.desktop_alerts ?? fallbackSettings.desktopAlerts,
    notifyOnCancellation: row?.notify_on_cancellation ?? fallbackSettings.notifyOnCancellation,
  };
}

function getLocalDateString(offsetDays = 0): string {
  const now = new Date();
  now.setDate(now.getDate() + offsetDays);
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

const DEFAULT_ROOMS: DbRoomRow[] = [
  {
    id: 'room-besar',
    code: 'R-01',
    name: 'Ruang Meeting Besar',
    floor: '',
    capacity: 11,
    amenities: [
      'Layar Presentasi 4K',
      'Kamera Konferensi',
      'Papan Tulis Kaca',
      'HDMI & USB-C Dock',
    ],
    description:
      'Ruang meeting berkapasitas 11 orang untuk rapat tim, presentasi klien, maupun diskusi lintas divisi.',
  },
  {
    id: 'room-kecil',
    code: 'R-02',
    name: 'Ruang Meeting Kecil',
    floor: '',
    capacity: 3,
    amenities: [
      'Monitor Presentasi',
      'Papan Tulis',
      'HDMI Dock',
    ],
    description:
      'Ruang meeting ringkas berkapasitas 3 orang untuk diskusi cepat, 1-on-1, atau panggilan daring.',
  },
];

async function ensureSupabaseSeeded(): Promise<void> {
  try {
    // Ensure the 2 requested rooms exist with up-to-date names & capacities
    const { error: upsertErr } = await supabase
      .from('rooms')
      .upsert(DEFAULT_ROOMS, { onConflict: 'id' });

    if (upsertErr) {
      console.warn('Supabase rooms upsert warning:', upsertErr.message);
      return;
    }

    // Migrate any legacy bookings from room-utama -> room-besar, then remove room-utama
    await supabase
      .from('bookings')
      .update({ room_id: 'room-besar' })
      .eq('room_id', 'room-utama');

    await supabase
      .from('rooms')
      .delete()
      .eq('id', 'room-utama');

    const { data: existingBookings } = await supabase
      .from('bookings')
      .select('id')
      .limit(1);

    if (!existingBookings || existingBookings.length === 0) {
      const today = getLocalDateString(0);
      const tomorrow = getLocalDateString(1);
      const nowIso = new Date().toISOString();

      const seedBookings: DbBookingRow[] = [
        {
          id: 'bk-seed-1',
          room_id: 'room-besar',
          title: 'Tinjauan Anggaran & Operasional',
          description: 'Evaluasi progres operasional dan rencana kerja minggu berjalan.',
          date: today,
          start_time: '09:00',
          end_time: '10:30',
          organizer_name: 'Nadia Kusuma',
          organizer_email: 'nadia.kusuma@perusahaan.id',
          attendees: ['nadia.kusuma@perusahaan.id', 'budi.santoso@perusahaan.id'],
          status: 'confirmed',
          reminder_minutes: 15,
          reminder_sent: true,
          created_at: nowIso,
          updated_at: nowIso,
        },
        {
          id: 'bk-seed-2',
          room_id: 'room-kecil',
          title: 'Diskusi 1-on-1 Produk',
          description: 'Sinkronisasi singkat prioritas rilis mingguan.',
          date: today,
          start_time: '13:00',
          end_time: '14:00',
          organizer_name: 'Dimas Wijaya',
          organizer_email: 'dimas.wijaya@perusahaan.id',
          attendees: ['dimas.wijaya@perusahaan.id', 'clara.putri@perusahaan.id'],
          status: 'confirmed',
          reminder_minutes: 15,
          reminder_sent: false,
          created_at: nowIso,
          updated_at: nowIso,
        },
        {
          id: 'bk-seed-3',
          room_id: 'room-besar',
          title: 'Evaluasi Proyek Klien',
          description: 'Penyelarasan timeline pengiriman dokumen kontrak.',
          date: tomorrow,
          start_time: '10:00',
          end_time: '11:30',
          organizer_name: 'Siti Anisah',
          organizer_email: 'stnisado@gmail.com',
          attendees: ['stnisado@gmail.com', 'andi.rahman@perusahaan.id'],
          status: 'confirmed',
          reminder_minutes: 15,
          reminder_sent: false,
          created_at: nowIso,
          updated_at: nowIso,
        },
      ];

      await supabase.from('bookings').insert(seedBookings);
    }
  } catch (err) {
    console.warn('Supabase seed skipped:', err instanceof Error ? err.message : err);
  }
}

async function fetchRooms(): Promise<Room[]> {
  const { data, error } = await supabase.from('rooms').select('*').order('code');
  if (error || !data || data.length === 0) {
    return DEFAULT_ROOMS.map(mapRoomRow);
  }
  return (data as DbRoomRow[]).map(mapRoomRow);
}

async function fetchBookings(dateParam?: string): Promise<Booking[]> {
  let query = supabase
    .from('bookings')
    .select('*')
    .order('date', { ascending: true })
    .order('start_time', { ascending: true });

  if (dateParam) {
    query = query.eq('date', dateParam);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return ((data || []) as DbBookingRow[]).map(mapBookingRow);
}

async function fetchSettings(): Promise<NotificationSettings> {
  const { data, error } = await supabase
    .from('notification_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();

  if (error || !data) {
    return { ...fallbackSettings };
  }
  return mapSettingsRow(data as DbSettingsRow);
}

async function fetchNotifications(): Promise<NotificationItem[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    return fallbackNotifications;
  }
  const dbItems = ((data || []) as DbNotificationRow[]).map(mapNotificationRow);
  if (dbItems.length === 0 && fallbackNotifications.length > 0) {
    return fallbackNotifications;
  }
  const dbIds = new Set(dbItems.map((i) => i.id));
  const merged = [...dbItems, ...fallbackNotifications.filter((f) => !dbIds.has(f.id))];
  return merged.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100);
}

const sseClients = new Set<Response>();

function broadcastSseEvent(eventPayload: Record<string, unknown>): void {
  const payload = `data: ${JSON.stringify(eventPayload)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

async function broadcastBookingsSnapshot(): Promise<void> {
  try {
    const bookings = await fetchBookings();
    broadcastSseEvent({ type: 'bookings_sync', bookings });
  } catch (err) {
    console.error('Broadcast bookings error:', err);
  }
}

async function createNotificationRecord(
  item: Omit<NotificationItem, 'id' | 'createdAt' | 'read'>
): Promise<NotificationItem> {
  const nowIso = new Date().toISOString();
  const id = `notif-${crypto.randomUUID().slice(0, 8)}`;
  const row: DbNotificationRow = {
    id,
    type: item.type,
    title: item.title,
    message: item.message,
    booking_id: item.bookingId ?? null,
    room_name: item.roomName ?? null,
    meeting_date: item.meetingDate ?? null,
    meeting_time: item.meetingTime ?? null,
    read: false,
    channels: item.channels,
    created_at: nowIso,
  };

  const { data, error } = await supabase
    .from('notifications')
    .insert([row])
    .select()
    .single();

  const mapped: NotificationItem = !error && data
    ? mapNotificationRow(data as DbNotificationRow)
    : {
        id,
        type: item.type,
        title: item.title,
        message: item.message,
        bookingId: item.bookingId,
        roomName: item.roomName,
        meetingDate: item.meetingDate,
        meetingTime: item.meetingTime,
        read: false,
        createdAt: nowIso,
        channels: item.channels,
      };

  if (error) {
    fallbackNotifications = [mapped, ...fallbackNotifications].slice(0, 100);
  }

  broadcastSseEvent({ type: 'notification', notification: mapped });
  return mapped;
}

async function findTimeOverlap(
  roomId: string,
  date: string,
  startTime: string,
  endTime: string,
  excludeBookingId?: string
): Promise<Booking | undefined> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('room_id', roomId)
    .eq('date', date)
    .eq('status', 'confirmed');

  if (error) throw new Error(error.message);

  const newStart = toMinutes(startTime);
  const newEnd = toMinutes(endTime);

  const bookings = ((data || []) as DbBookingRow[]).map(mapBookingRow);
  return bookings.find((b) => {
    if (excludeBookingId && b.id === excludeBookingId) return false;
    const bStart = toMinutes(b.startTime);
    const bEnd = toMinutes(b.endTime);
    return newStart < bEnd && newEnd > bStart;
  });
}

function formatIcsTimestamp(dateStr: string, timeStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  const dt = new Date(y, m - 1, d, hh, mm, 0);
  return dt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function escapeIcsText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

function buildIcsEventLines(booking: Booking, room?: Room): string[] {
  const location = room ? `${room.name} (${room.code})` : 'Ruang Meeting Kantor';
  const dtStart = formatIcsTimestamp(booking.date, booking.startTime);
  const dtEnd = formatIcsTimestamp(booking.date, booking.endTime);
  const dtStamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const attendeeLines = booking.attendees.map(
    (email) => `ATTENDEE;CN=${escapeIcsText(email)};RSVP=TRUE:mailto:${email}`
  );

  return [
    'BEGIN:VEVENT',
    `UID:${booking.id}@ruangkantor.local`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeIcsText(`[${room?.code || 'R-01'}] ${booking.title}`)}`,
    `DESCRIPTION:${escapeIcsText(booking.description || `Reservasi oleh ${booking.organizerName}`)}`,
    `LOCATION:${escapeIcsText(location)}`,
    `ORGANIZER;CN=${escapeIcsText(booking.organizerName)}:mailto:${booking.organizerEmail}`,
    ...attendeeLines,
    'BEGIN:VALARM',
    `TRIGGER:-PT${booking.reminderMinutes || 15}M`,
    'ACTION:DISPLAY',
    `DESCRIPTION:Pengingat rapat di ${escapeIcsText(location)}`,
    'END:VALARM',
    'END:VEVENT',
  ];
}

// Background automatic reminder scheduler (runs every 15 seconds)
async function runReminderCheck(): Promise<void> {
  try {
    const now = new Date();
    const todayStr = getLocalDateString(0);
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const [todayBookings, rooms, settings] = await Promise.all([
      fetchBookings(todayStr),
      fetchRooms(),
      fetchSettings(),
    ]);

    let updatedAny = false;

    for (const booking of todayBookings) {
      if (booking.status !== 'confirmed' || booking.reminderSent) {
        continue;
      }
      const startMins = toMinutes(booking.startTime);
      const diff = startMins - currentMinutes;
      const lead = booking.reminderMinutes || settings.reminderMinutesBefore || 15;
      if (diff > 0 && diff <= lead) {
        const room = rooms.find((r) => r.id === booking.roomId);
        const { error } = await supabase
          .from('bookings')
          .update({ reminder_sent: true, updated_at: new Date().toISOString() })
          .eq('id', booking.id);

        if (!error) {
          updatedAny = true;
          await createNotificationRecord({
            type: 'meeting_reminder',
            title: `Pengingat Rapat (${diff} menit lagi): ${booking.title}`,
            message: `Rapat Anda di ${room ? `${room.name} (${room.code})` : 'ruang meeting'} akan dimulai pukul ${booking.startTime}–${booking.endTime}.`,
            bookingId: booking.id,
            roomName: room?.name,
            meetingDate: booking.date,
            meetingTime: `${booking.startTime}–${booking.endTime}`,
            channels: {
              inApp: true,
              attendeeCount: booking.attendees.length,
              reminderScheduledMinutes: lead,
            },
          });
        }
      }
    }

    if (updatedAny) {
      await broadcastBookingsSnapshot();
    }
  } catch (err) {
    console.error('Reminder scheduler check error:', err);
  }
}

setInterval(() => {
  void runReminderCheck();
}, 15_000);

async function startServer(): Promise<void> {
  await ensureSupabaseSeeded();

  const app = express();
  app.use(express.json());

  app.get('/api/health', async (_req: Request, res: Response) => {
    try {
      const rooms = await fetchRooms();
      res.json({
        status: 'ok',
        database: 'supabase',
        roomsCount: rooms.length,
        time: new Date().toISOString(),
      });
    } catch (err) {
      res.status(500).json({
        status: 'error',
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  });

  app.get('/api/rooms', async (_req: Request, res: Response) => {
    try {
      const rooms = await fetchRooms();
      res.json({ rooms });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Gagal memuat ruang meeting.',
      });
    }
  });

  app.get('/api/bookings', async (req: Request, res: Response) => {
    try {
      const dateParam = typeof req.query.date === 'string' ? req.query.date : undefined;
      const bookings = await fetchBookings(dateParam);
      res.json({ bookings });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Gagal memuat daftar reservasi.',
      });
    }
  });

  app.post('/api/bookings', async (req: Request, res: Response) => {
    try {
      const body = req.body as Partial<Booking>;
      const rooms = await fetchRooms();
      const targetRoomId = body.roomId || rooms[0]?.id || 'room-besar';

      if (!targetRoomId || !body.title?.trim() || !body.date || !body.startTime || !body.endTime) {
        res.status(400).json({
          error: 'Data reservasi tidak lengkap (judul, tanggal, dan jam wajib diisi).',
        });
        return;
      }

      const room = rooms.find((r) => r.id === targetRoomId) || rooms[0];
      if (!room) {
        res.status(404).json({ error: 'Ruang meeting tidak ditemukan.' });
        return;
      }

      if (toMinutes(body.endTime) <= toMinutes(body.startTime)) {
        res.status(400).json({ error: 'Jam selesai harus lebih besar dari jam mulai.' });
        return;
      }

      const conflict = await findTimeOverlap(targetRoomId, body.date, body.startTime, body.endTime);
      if (conflict) {
        res.status(409).json({
          error: `Bentrok jadwal: ${room.name} sudah dipesan oleh ${conflict.organizerName} (${conflict.startTime}–${conflict.endTime}) untuk "${conflict.title}".`,
          conflict,
        });
        return;
      }

      const settings = await fetchSettings();
      const nowIso = new Date().toISOString();
      const attendees = Array.isArray(body.attendees)
        ? body.attendees.map((e) => e.trim()).filter(Boolean)
        : [];
      const reminderMinutes =
        typeof body.reminderMinutes === 'number' && body.reminderMinutes > 0
          ? body.reminderMinutes
          : settings.reminderMinutesBefore;

      const row: DbBookingRow = {
        id: `bk-${crypto.randomUUID().slice(0, 8)}`,
        room_id: targetRoomId,
        title: body.title.trim(),
        description: (body.description || '').trim(),
        date: body.date,
        start_time: body.startTime,
        end_time: body.endTime,
        organizer_name: (body.organizerName || 'Pengguna Kantor').trim(),
        organizer_email: (body.organizerEmail || 'pengguna@perusahaan.id').trim(),
        attendees,
        status: 'confirmed',
        reminder_minutes: reminderMinutes,
        reminder_sent: false,
        created_at: nowIso,
        updated_at: nowIso,
      };

      const { data, error } = await supabase
        .from('bookings')
        .insert([row])
        .select()
        .single();

      if (error) {
        res.status(500).json({ error: `Gagal menyimpan ke Supabase: ${error.message}` });
        return;
      }

      const newBooking = mapBookingRow(data as DbBookingRow);
      await broadcastBookingsSnapshot();

      await createNotificationRecord({
        type: 'booking_created',
        title: `Reservasi Baru: ${newBooking.title}`,
        message: `${room.name} (${room.code}) dipesan oleh ${newBooking.organizerName} pada ${newBooking.date} pukul ${newBooking.startTime}–${newBooking.endTime}.`,
        bookingId: newBooking.id,
        roomName: room.name,
        meetingDate: newBooking.date,
        meetingTime: `${newBooking.startTime}–${newBooking.endTime}`,
        channels: {
          inApp: true,
          attendeeCount: newBooking.attendees.length,
          reminderScheduledMinutes: reminderMinutes,
        },
      });

      void runReminderCheck();
      res.status(201).json({ booking: newBooking });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Gagal membuat reservasi.',
      });
    }
  });

  app.patch('/api/bookings/:id', async (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      const { data: existingRow, error: findErr } = await supabase
        .from('bookings')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (findErr) {
        res.status(500).json({ error: findErr.message });
        return;
      }
      if (!existingRow) {
        res.status(404).json({ error: 'Reservasi tidak ditemukan.' });
        return;
      }

      const existing = mapBookingRow(existingRow as DbBookingRow);
      const patch = req.body as Partial<Booking>;

      const nextRoomId = patch.roomId ?? existing.roomId;
      const nextDate = patch.date ?? existing.date;
      const nextStart = patch.startTime ?? existing.startTime;
      const nextEnd = patch.endTime ?? existing.endTime;

      const rooms = await fetchRooms();
      const room = rooms.find((r) => r.id === nextRoomId) || rooms[0];

      if (toMinutes(nextEnd) <= toMinutes(nextStart)) {
        res.status(400).json({ error: 'Jam selesai harus lebih besar dari jam mulai.' });
        return;
      }

      const nextStatus = patch.status ?? existing.status;
      if (nextStatus === 'confirmed') {
        const conflict = await findTimeOverlap(nextRoomId, nextDate, nextStart, nextEnd, existing.id);
        if (conflict) {
          res.status(409).json({
            error: `Bentrok jadwal dengan "${conflict.title}" (${conflict.startTime}–${conflict.endTime}).`,
            conflict,
          });
          return;
        }
      }

      const scheduleChanged =
        nextRoomId !== existing.roomId ||
        nextDate !== existing.date ||
        nextStart !== existing.startTime ||
        nextEnd !== existing.endTime;

      const updatePayload = {
        room_id: nextRoomId,
        title: patch.title !== undefined ? patch.title.trim() : existing.title,
        description: patch.description !== undefined ? patch.description.trim() : existing.description,
        date: nextDate,
        start_time: nextStart,
        end_time: nextEnd,
        organizer_name: patch.organizerName !== undefined ? patch.organizerName.trim() : existing.organizerName,
        organizer_email: patch.organizerEmail !== undefined ? patch.organizerEmail.trim() : existing.organizerEmail,
        attendees: patch.attendees !== undefined ? patch.attendees : existing.attendees,
        status: nextStatus,
        reminder_minutes: patch.reminderMinutes ?? existing.reminderMinutes,
        reminder_sent: scheduleChanged ? false : (patch.reminderSent ?? existing.reminderSent),
        updated_at: new Date().toISOString(),
      };

      const { data: updatedRow, error: updErr } = await supabase
        .from('bookings')
        .update(updatePayload)
        .eq('id', id)
        .select()
        .single();

      if (updErr) {
        res.status(500).json({ error: `Gagal memperbarui reservasi: ${updErr.message}` });
        return;
      }

      const updated = mapBookingRow(updatedRow as DbBookingRow);
      await broadcastBookingsSnapshot();

      await createNotificationRecord({
        type: 'booking_updated',
        title: `Jadwal Diperbarui: ${updated.title}`,
        message: `${room.name} (${updated.date}, ${updated.startTime}–${updated.endTime}) berhasil diperbarui.`,
        bookingId: updated.id,
        roomName: room.name,
        meetingDate: updated.date,
        meetingTime: `${updated.startTime}–${updated.endTime}`,
        channels: {
          inApp: true,
          attendeeCount: updated.attendees.length,
          reminderScheduledMinutes: updated.reminderMinutes,
        },
      });

      void runReminderCheck();
      res.json({ booking: updated });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Gagal memperbarui reservasi.',
      });
    }
  });

  app.delete('/api/bookings/:id', async (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      const { data: existingRow, error: findErr } = await supabase
        .from('bookings')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (findErr) {
        res.status(500).json({ error: findErr.message });
        return;
      }
      if (!existingRow) {
        res.status(404).json({ error: 'Reservasi tidak ditemukan.' });
        return;
      }

      const { data: updatedRow, error: delErr } = await supabase
        .from('bookings')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (delErr) {
        res.status(500).json({ error: `Gagal membatalkan reservasi: ${delErr.message}` });
        return;
      }

      const target = mapBookingRow(updatedRow as DbBookingRow);
      const [rooms, settings] = await Promise.all([fetchRooms(), fetchSettings()]);
      const room = rooms.find((r) => r.id === target.roomId);

      await broadcastBookingsSnapshot();

      if (settings.notifyOnCancellation) {
        await createNotificationRecord({
          type: 'booking_cancelled',
          title: `Reservasi Dibatalkan: ${target.title}`,
          message: `Slot ${room ? `${room.name} (${room.code})` : 'ruang meeting'} pada ${target.date} (${target.startTime}–${target.endTime}) kini tersedia kembali.`,
          bookingId: target.id,
          roomName: room?.name,
          meetingDate: target.date,
          meetingTime: `${target.startTime}–${target.endTime}`,
          channels: {
            inApp: true,
            attendeeCount: target.attendees.length,
          },
        });
      }

      res.json({ booking: target });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Gagal membatalkan reservasi.',
      });
    }
  });

  app.get('/api/bookings/:id/ics', async (req: Request, res: Response) => {
    try {
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('id', req.params.id)
        .maybeSingle();

      if (error || !data) {
        res.status(404).json({ error: 'Reservasi tidak ditemukan.' });
        return;
      }
      const booking = mapBookingRow(data as DbBookingRow);
      const rooms = await fetchRooms();
      const room = rooms.find((r) => r.id === booking.roomId);

      const icsContent = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//RuangKantor//Meeting Room Booking//ID',
        'CALSCALE:GREGORIAN',
        'METHOD:REQUEST',
        ...buildIcsEventLines(booking, room),
        'END:VCALENDAR',
      ].join('\r\n');

      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="reservasi-${booking.id}.ics"`);
      res.send(icsContent);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Gagal membuat file .ics' });
    }
  });

  app.get('/api/calendar.ics', async (_req: Request, res: Response) => {
    try {
      const [allBookings, rooms] = await Promise.all([fetchBookings(), fetchRooms()]);
      const active = allBookings.filter((b) => b.status === 'confirmed');
      const eventBlocks = active.flatMap((booking) => {
        const room = rooms.find((r) => r.id === booking.roomId);
        return buildIcsEventLines(booking, room);
      });

      const icsContent = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//RuangKantor//Office Room Calendar Feed//ID',
        'X-WR-CALNAME:Jadwal Ruang Meeting Kantor (RuangKantor)',
        'CALSCALE:GREGORIAN',
        ...eventBlocks,
        'END:VCALENDAR',
      ].join('\r\n');

      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader('Content-Disposition', 'inline; filename="ruangkantor-jadwal.ics"');
      res.send(icsContent);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Gagal membuat feed .ics' });
    }
  });

  app.get('/api/notifications', async (_req: Request, res: Response) => {
    try {
      const [notifications, settings] = await Promise.all([
        fetchNotifications(),
        fetchSettings(),
      ]);
      const unreadCount = notifications.filter((n) => !n.read).length;
      res.json({ notifications, unreadCount, settings });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Gagal memuat notifikasi.',
      });
    }
  });

  app.post('/api/notifications/mark-read', async (req: Request, res: Response) => {
    try {
      const { id, all } = req.body as { id?: string; all?: boolean };
      if (all) {
        await supabase.from('notifications').update({ read: true }).eq('read', false);
        fallbackNotifications = fallbackNotifications.map((n) => ({ ...n, read: true }));
      } else if (id) {
        await supabase.from('notifications').update({ read: true }).eq('id', id);
        fallbackNotifications = fallbackNotifications.map((n) =>
          n.id === id ? { ...n, read: true } : n
        );
      }
      const notifications = await fetchNotifications();
      const unreadCount = notifications.filter((n) => !n.read).length;
      res.json({ unreadCount, notifications });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Gagal menandai notifikasi.',
      });
    }
  });

  app.post('/api/notifications/test', async (_req: Request, res: Response) => {
    try {
      const settings = await fetchSettings();
      const notification = await createNotificationRecord({
        type: 'system_test',
        title: 'Uji Notifikasi Real-Time Berhasil',
        message: `Sistem pengingat aktif (H-${settings.reminderMinutesBefore} menit sebelum rapat).`,
        channels: {
          inApp: true,
          attendeeCount: 1,
          reminderScheduledMinutes: settings.reminderMinutesBefore,
        },
      });
      res.json({ notification });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Gagal mengirim notifikasi uji.',
      });
    }
  });

  app.get('/api/notifications/settings', async (_req: Request, res: Response) => {
    try {
      const settings = await fetchSettings();
      res.json({ settings });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Gagal memuat pengaturan.',
      });
    }
  });

  app.put('/api/notifications/settings', async (req: Request, res: Response) => {
    try {
      const patch = req.body as Partial<NotificationSettings>;
      const current = await fetchSettings();
      const merged: NotificationSettings = {
        ...current,
        ...patch,
      };
      fallbackSettings = merged;

      await supabase.from('notification_settings').upsert(
        [
          {
            id: 1,
            reminder_minutes_before: merged.reminderMinutesBefore,
            desktop_alerts: merged.desktopAlerts,
            notify_on_cancellation: merged.notifyOnCancellation,
          },
        ],
        { onConflict: 'id' }
      );

      res.json({ settings: merged });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Gagal menyimpan pengaturan.',
      });
    }
  });

  app.get('/api/notifications/stream', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    res.write(
      `data: ${JSON.stringify({ type: 'connected', serverTime: new Date().toISOString() })}\n\n`
    );
    sseClients.add(res);

    const clientRef = res;
    const keepAlive = setInterval(() => {
      try {
        res.write(': keepalive\n\n');
      } catch {
        clearInterval(keepAlive);
        sseClients.delete(clientRef);
      }
    }, 20_000);

    req.on('close', () => {
      clearInterval(keepAlive);
      sseClients.delete(res);
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Always bind to port 3000 in dev (container sets PORT=8080 for nginx reverse proxy)
  const PORT =
    process.env.NODE_ENV === 'production'
      ? Number(process.env.PORT) || 3000
      : Number(process.env.DEFAULT_APP_PORT) || 3000;

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`RuangKantor server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
