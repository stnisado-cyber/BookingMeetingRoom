import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bell,
  CalendarPlus,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  ExternalLink,
  Pencil,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import type {
  Booking,
  NotificationItem,
  NotificationSettings,
  Room,
} from './types/booking';
import { supabase } from './lib/supabaseClient';
import { buildGoogleCalendarTemplateUrl } from './lib/calendarLinks';
import { SlotGrid } from './components/SlotGrid';
import { MiniCalendarCard } from './components/MiniCalendarCard';
import { NotificationsDrawer } from './components/NotificationsDrawer';
import { BookingModal, type BookingFormValues } from './components/BookingModal';
import { ConfirmationModal } from './components/ConfirmationModal';

const DEFAULT_ROOMS: Room[] = [
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
    amenities: ['Monitor Presentasi', 'Papan Tulis', 'HDMI Dock'],
    description:
      'Ruang meeting ringkas berkapasitas 3 orang untuk diskusi cepat, 1-on-1, atau panggilan daring.',
  },
];

const DEFAULT_SETTINGS: NotificationSettings = {
  reminderMinutesBefore: 15,
  desktopAlerts: false,
  notifyOnCancellation: true,
};

interface DbRoomRow {
  id: string;
  code: string;
  name: string;
  floor: string | null;
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
  reminder_minutes: number | null;
  reminder_sent: boolean | null;
  created_at: string;
  updated_at: string;
}

interface DbNotificationRow {
  id: string;
  type: NotificationItem['type'];
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

function CompanyBrandLogo() {
  return (
    <div className="flex shrink-0 items-center gap-2.5">
      <div className="flex h-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white px-2 py-1 shadow-xs">
        <img
          src="/logo-pla.png"
          alt="Logo PT Permata Lintas Abadi"
          className="h-full w-auto max-w-[120px] object-contain"
        />
      </div>
      <span className="whitespace-nowrap font-display text-sm font-bold tracking-tight text-white sm:text-base">
        PT Permata Lintas Abadi
      </span>
    </div>
  );
}

function mapRoomRow(row: DbRoomRow): Room {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    floor: row.floor || '',
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
    status: row.status === 'cancelled' ? 'cancelled' : 'confirmed',
    reminderMinutes: row.reminder_minutes ?? 15,
    reminderSent: Boolean(row.reminder_sent),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapNotificationRow(row: DbNotificationRow): NotificationItem {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    bookingId: row.booking_id ?? undefined,
    roomName: row.room_name ?? undefined,
    meetingDate: row.meeting_date ?? undefined,
    meetingTime: row.meeting_time ?? undefined,
    read: Boolean(row.read),
    createdAt: row.created_at,
    channels: {
      inApp: row.channels?.inApp ?? true,
      attendeeCount: row.channels?.attendeeCount ?? 0,
      reminderScheduledMinutes: row.channels?.reminderScheduledMinutes,
    },
  };
}

function formatLocalDateString(dt: Date): string {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function shiftDateString(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return formatLocalDateString(dt);
}

function formatDateHeading(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function formatIcsTimestamp(dateStr: string, timeStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  const dt = new Date(y, m - 1, d, hh, mm, 0);
  return dt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function downloadBookingIcs(booking: Booking, room?: Room): void {
  const location = room ? `${room.name} (${room.code})` : 'Ruang Meeting Kantor';
  const dtStart = formatIcsTimestamp(booking.date, booking.startTime);
  const dtEnd = formatIcsTimestamp(booking.date, booking.endTime);
  const dtStamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PT Permata Lintas Abadi//Meeting Room Booking//ID',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${booking.id}@permatalintasabadi.local`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeIcsText(`[${room?.code || 'R-01'}] ${booking.title}`)}`,
    `DESCRIPTION:${escapeIcsText(booking.description || `Reservasi oleh ${booking.organizerName}`)}`,
    `LOCATION:${escapeIcsText(location)}`,
    `ORGANIZER;CN=${escapeIcsText(booking.organizerName)}:mailto:${booking.organizerEmail}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  const blob = new Blob([lines.join('\r\n')], {
    type: 'text/calendar;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `reservasi-${booking.id}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function App() {
  const [nowTick, setNowTick] = useState<Date>(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string>(() =>
    formatLocalDateString(new Date())
  );
  const [selectedRoomId, setSelectedRoomId] = useState<string>('room-besar');

  const [userName, setUserName] = useState('Siti Anisah');
  const [userEmail, setUserEmail] = useState('stnisado@gmail.com');

  const [rooms, setRooms] = useState<Room[]>(DEFAULT_ROOMS);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_SETTINGS);
  const [isLoadingData, setIsLoadingData] = useState(true);

  const [agendaScope, setAgendaScope] = useState<'date' | 'upcoming'>('date');
  const [agendaSearch, setAgendaSearch] = useState('');

  const [isNotifDrawerOpen, setIsNotifDrawerOpen] = useState(false);
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [modalInitialRoomId, setModalInitialRoomId] = useState<string | undefined>();
  const [modalInitialStart, setModalInitialStart] = useState<string | undefined>();
  const [modalInitialEnd, setModalInitialEnd] = useState<string | undefined>();
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [isSubmittingBooking, setIsSubmittingBooking] = useState(false);
  const [bookingServerError, setBookingServerError] = useState<string | null>(null);

  const [bookingToCancel, setBookingToCancel] = useState<Booking | null>(null);
  const [isProcessingCancel, setIsProcessingCancel] = useState(false);

  const [toastNotification, setToastNotification] = useState<NotificationItem | null>(null);
  const [browserPermission, setBrowserPermission] = useState<
    NotificationPermission | 'unsupported'
  >(() =>
    typeof window !== 'undefined' && 'Notification' in window
      ? Notification.permission
      : 'unsupported'
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setNowTick(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const pushLocalNotification = useCallback(
    (item: Omit<NotificationItem, 'id' | 'createdAt' | 'read'>) => {
      const mapped: NotificationItem = {
        ...item,
        id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        createdAt: new Date().toISOString(),
        read: false,
      };
      setNotifications((prev) => [mapped, ...prev].slice(0, 100));
      setUnreadCount((c) => c + 1);
      setToastNotification(mapped);

      void supabase.from('notifications').insert([
        {
          id: mapped.id,
          type: mapped.type,
          title: mapped.title,
          message: mapped.message,
          booking_id: mapped.bookingId ?? null,
          room_name: mapped.roomName ?? null,
          meeting_date: mapped.meetingDate ?? null,
          meeting_time: mapped.meetingTime ?? null,
          read: false,
          channels: mapped.channels,
          created_at: mapped.createdAt,
        },
      ]);

      if (
        typeof window !== 'undefined' &&
        'Notification' in window &&
        Notification.permission === 'granted' &&
        settings.desktopAlerts
      ) {
        new Notification(mapped.title, { body: mapped.message });
      }
    },
    [settings.desktopAlerts]
  );

  const fetchCoreData = useCallback(async () => {
    try {
      const [roomsRes, bookingsRes, notifRes, settingsRes] = await Promise.all([
        supabase.from('rooms').select('*').order('code'),
        supabase
          .from('bookings')
          .select('*')
          .order('date', { ascending: true })
          .order('start_time', { ascending: true }),
        supabase
          .from('notifications')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100),
        supabase.from('notification_settings').select('*').eq('id', 1).maybeSingle(),
      ]);

      if (!roomsRes.error && roomsRes.data && roomsRes.data.length > 0) {
        const loadedRooms = (roomsRes.data as DbRoomRow[]).map(mapRoomRow);
        setRooms(loadedRooms);
      } else {
        setRooms(DEFAULT_ROOMS);
      }

      if (!bookingsRes.error && bookingsRes.data) {
        setBookings((bookingsRes.data as DbBookingRow[]).map(mapBookingRow));
      }

      if (!notifRes.error && notifRes.data) {
        const mappedNotifs = (notifRes.data as DbNotificationRow[]).map(mapNotificationRow);
        setNotifications(mappedNotifs);
        setUnreadCount(mappedNotifs.filter((n) => !n.read).length);
      }

      if (!settingsRes.error && settingsRes.data) {
        setSettings({
          reminderMinutesBefore:
            settingsRes.data.reminder_minutes_before ?? DEFAULT_SETTINGS.reminderMinutesBefore,
          desktopAlerts: Boolean(settingsRes.data.desktop_alerts),
          notifyOnCancellation:
            settingsRes.data.notify_on_cancellation ?? DEFAULT_SETTINGS.notifyOnCancellation,
        });
      }
    } catch (err) {
      console.error('Failed to load workspace data from Supabase:', err);
    } finally {
      setIsLoadingData(false);
    }
  }, []);

  useEffect(() => {
    void fetchCoreData();
  }, [fetchCoreData]);

  useEffect(() => {
    const channel = supabase
      .channel('public:bookings-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings' },
        () => {
          void fetchCoreData();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchCoreData]);

  useEffect(() => {
    if (!toastNotification) return;
    const timer = setTimeout(() => setToastNotification(null), 6000);
    return () => clearTimeout(timer);
  }, [toastNotification]);

  const openNewBookingModal = (roomId?: string, startTime?: string, endTime?: string) => {
    setEditingBooking(null);
    setModalInitialRoomId(roomId || selectedRoomId);
    setModalInitialStart(startTime);
    setModalInitialEnd(endTime);
    setBookingServerError(null);
    setIsBookingModalOpen(true);
  };

  const openEditBookingModal = (booking: Booking) => {
    setEditingBooking(booking);
    setBookingServerError(null);
    setIsBookingModalOpen(true);
  };

  const findConflict = (
    roomId: string,
    date: string,
    startTime: string,
    endTime: string,
    excludeId?: string
  ): Booking | undefined => {
    const newStart = toMinutes(startTime);
    const newEnd = toMinutes(endTime);
    return bookings.find((b) => {
      if (b.status !== 'confirmed') return false;
      if (excludeId && b.id === excludeId) return false;
      if (b.roomId !== roomId || b.date !== date) return false;
      const bStart = toMinutes(b.startTime);
      const bEnd = toMinutes(b.endTime);
      return newStart < bEnd && newEnd > bStart;
    });
  };

  const handleBookingModalSubmit = async (values: BookingFormValues) => {
    setIsSubmittingBooking(true);
    setBookingServerError(null);
    try {
      const targetRoomId = values.roomId || rooms[0]?.id || 'room-besar';
      const room = rooms.find((r) => r.id === targetRoomId) || rooms[0];

      if (!values.title?.trim() || !values.date || !values.startTime || !values.endTime) {
        setBookingServerError('Data reservasi tidak lengkap (judul, tanggal, dan jam wajib diisi).');
        return;
      }

      if (toMinutes(values.endTime) <= toMinutes(values.startTime)) {
        setBookingServerError('Jam selesai harus lebih besar dari jam mulai.');
        return;
      }

      const conflict = findConflict(
        targetRoomId,
        values.date,
        values.startTime,
        values.endTime,
        editingBooking?.id
      );
      if (conflict) {
        setBookingServerError(
          `Bentrok jadwal: ${room?.name || targetRoomId} sudah dipesan oleh ${conflict.organizerName} (${conflict.startTime}–${conflict.endTime}) untuk "${conflict.title}".`
        );
        return;
      }

      const nowIso = new Date().toISOString();
      const attendees = Array.isArray(values.attendees)
        ? values.attendees.map((e) => e.trim()).filter(Boolean)
        : [];
      const reminderMinutes =
        typeof values.reminderMinutes === 'number' && values.reminderMinutes > 0
          ? values.reminderMinutes
          : settings.reminderMinutesBefore;

      if (editingBooking) {
        const scheduleChanged =
          targetRoomId !== editingBooking.roomId ||
          values.date !== editingBooking.date ||
          values.startTime !== editingBooking.startTime ||
          values.endTime !== editingBooking.endTime;

        const { error } = await supabase
          .from('bookings')
          .update({
            room_id: targetRoomId,
            title: values.title.trim(),
            description: (values.description || '').trim(),
            date: values.date,
            start_time: values.startTime,
            end_time: values.endTime,
            organizer_name: (values.organizerName || userName || 'Pengguna Kantor').trim(),
            organizer_email: (values.organizerEmail || userEmail || 'pengguna@perusahaan.id').trim(),
            attendees,
            reminder_minutes: reminderMinutes,
            reminder_sent: scheduleChanged ? false : editingBooking.reminderSent,
            updated_at: nowIso,
          })
          .eq('id', editingBooking.id);

        if (error) {
          setBookingServerError(`Gagal memperbarui reservasi: ${error.message}`);
          return;
        }

        pushLocalNotification({
          type: 'booking_updated',
          title: `Jadwal Diperbarui: ${values.title.trim()}`,
          message: `${room?.name || targetRoomId} (${values.date}, ${values.startTime}–${values.endTime}) berhasil diperbarui.`,
          bookingId: editingBooking.id,
          roomName: room?.name,
          meetingDate: values.date,
          meetingTime: `${values.startTime}–${values.endTime}`,
          channels: {
            inApp: true,
            attendeeCount: attendees.length,
            reminderScheduledMinutes: reminderMinutes,
          },
        });
      } else {
        const newId = `bk-${Math.random().toString(36).slice(2, 10)}`;
        const organizerNameVal = (values.organizerName || userName || 'Pengguna Kantor').trim();
        const { error } = await supabase.from('bookings').insert([
          {
            id: newId,
            room_id: targetRoomId,
            title: values.title.trim(),
            description: (values.description || '').trim(),
            date: values.date,
            start_time: values.startTime,
            end_time: values.endTime,
            organizer_name: organizerNameVal,
            organizer_email: (values.organizerEmail || userEmail || 'pengguna@perusahaan.id').trim(),
            attendees,
            status: 'confirmed',
            reminder_minutes: reminderMinutes,
            reminder_sent: false,
            created_at: nowIso,
            updated_at: nowIso,
          },
        ]);

        if (error) {
          setBookingServerError(`Gagal menyimpan ke Supabase: ${error.message}`);
          return;
        }

        pushLocalNotification({
          type: 'booking_created',
          title: `Reservasi Baru: ${values.title.trim()}`,
          message: `${room?.name || targetRoomId} (${room?.code || 'R-01'}) dipesan oleh ${organizerNameVal} pada ${values.date} pukul ${values.startTime}–${values.endTime}.`,
          bookingId: newId,
          roomName: room?.name,
          meetingDate: values.date,
          meetingTime: `${values.startTime}–${values.endTime}`,
          channels: {
            inApp: true,
            attendeeCount: attendees.length,
            reminderScheduledMinutes: reminderMinutes,
          },
        });
      }

      setSelectedRoomId(targetRoomId);
      await fetchCoreData();
      setIsBookingModalOpen(false);
      setEditingBooking(null);
    } catch (err) {
      setBookingServerError(
        err instanceof Error ? err.message : 'Terjadi kesalahan saat menyimpan reservasi.'
      );
    } finally {
      setIsSubmittingBooking(false);
    }
  };

  const handleConfirmCancel = async () => {
    if (!bookingToCancel) return;
    setIsProcessingCancel(true);
    try {
      const { error } = await supabase
        .from('bookings')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', bookingToCancel.id);

      if (!error) {
        const room = rooms.find((r) => r.id === bookingToCancel.roomId);
        if (settings.notifyOnCancellation) {
          pushLocalNotification({
            type: 'booking_cancelled',
            title: `Reservasi Dibatalkan: ${bookingToCancel.title}`,
            message: `Slot ${room ? `${room.name} (${room.code})` : 'ruang meeting'} pada ${bookingToCancel.date} (${bookingToCancel.startTime}–${bookingToCancel.endTime}) kini tersedia kembali.`,
            bookingId: bookingToCancel.id,
            roomName: room?.name,
            meetingDate: bookingToCancel.date,
            meetingTime: `${bookingToCancel.startTime}–${bookingToCancel.endTime}`,
            channels: {
              inApp: true,
              attendeeCount: bookingToCancel.attendees.length,
            },
          });
        }
        await fetchCoreData();
      }
    } catch (err) {
      console.error('Cancellation failed:', err);
    } finally {
      setIsProcessingCancel(false);
      setBookingToCancel(null);
    }
  };

  const handleMarkNotificationRead = async (id?: string, all?: boolean) => {
    if (all) {
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
      await supabase.from('notifications').update({ read: true }).eq('read', false);
    } else if (id) {
      setNotifications((prev) => {
        const next = prev.map((n) => (n.id === id ? { ...n, read: true } : n));
        setUnreadCount(next.filter((n) => !n.read).length);
        return next;
      });
      await supabase.from('notifications').update({ read: true }).eq('id', id);
    }
  };

  const handleUpdateNotificationSettings = async (patch: Partial<NotificationSettings>) => {
    const merged = { ...settings, ...patch };
    setSettings(merged);
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
  };

  const handleRequestBrowserPermission = async () => {
    if (!('Notification' in window)) return;
    const perm = await Notification.requestPermission();
    setBrowserPermission(perm);
    if (perm === 'granted') {
      await handleUpdateNotificationSettings({ desktopAlerts: true });
    }
  };

  const handleSendTestNotification = async () => {
    pushLocalNotification({
      type: 'system_test',
      title: 'Uji Notifikasi Real-Time Berhasil',
      message: `Sistem pengingat aktif (H-${settings.reminderMinutesBefore} menit sebelum rapat).`,
      channels: {
        inApp: true,
        attendeeCount: 1,
        reminderScheduledMinutes: settings.reminderMinutesBefore,
      },
    });
  };

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const selectedRoom = rooms.find((r) => r.id === selectedRoomId) || rooms[0];
  const todayStr = formatLocalDateString(nowTick);
  const currentMinutes = nowTick.getHours() * 60 + nowTick.getMinutes();

  const getRoomActiveBookingNow = (roomId: string): Booking | undefined =>
    bookings.find(
      (b) =>
        b.roomId === roomId &&
        b.status === 'confirmed' &&
        b.date === todayStr &&
        currentMinutes >= toMinutes(b.startTime) &&
        currentMinutes < toMinutes(b.endTime)
    );

  const agendaBookings = useMemo(() => {
    const q = agendaSearch.trim().toLowerCase();
    return bookings
      .filter((b) => {
        if (b.status !== 'confirmed') return false;
        if (agendaScope === 'date' && b.date !== selectedDate) return false;
        if (agendaScope === 'upcoming' && b.date < todayStr) return false;
        if (!q) return true;
        const room = rooms.find((r) => r.id === b.roomId);
        return (
          b.title.toLowerCase().includes(q) ||
          b.organizerName.toLowerCase().includes(q) ||
          (room?.name.toLowerCase().includes(q) ?? false) ||
          b.date.includes(q)
        );
      })
      .sort((a, b) =>
        a.date === b.date
          ? a.startTime.localeCompare(b.startTime)
          : a.date.localeCompare(b.date)
      );
  }, [bookings, rooms, agendaScope, selectedDate, todayStr, agendaSearch]);

  const liveClockString = nowTick.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const liveDateString = nowTick.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const cancelRoom = rooms.find((r) => r.id === bookingToCancel?.roomId);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-30 border-b border-[#0E347C] bg-[#0E347C] text-white">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-6 px-4 sm:px-6">
          <a
            href="#jadwal"
            onClick={(e) => {
              e.preventDefault();
              scrollToSection('jadwal');
            }}
            className="flex shrink-0 items-center text-white"
          >
            <CompanyBrandLogo />
          </a>

          <nav
            aria-label="Navigasi utama"
            className="hidden items-center gap-6 text-sm font-medium text-white/85 md:flex"
          >
            <button
              type="button"
              onClick={() => scrollToSection('jadwal')}
              className="whitespace-nowrap shrink-0 hover:text-white hover:underline underline-offset-4"
            >
              Jadwal
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('agenda')}
              className="whitespace-nowrap shrink-0 hover:text-white hover:underline underline-offset-4"
            >
              Agenda
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('kalender')}
              className="whitespace-nowrap shrink-0 hover:text-white hover:underline underline-offset-4"
            >
              Kalender
            </button>
            <button
              type="button"
              onClick={() => setIsNotifDrawerOpen(true)}
              className="whitespace-nowrap shrink-0 hover:text-white hover:underline underline-offset-4 tabular-nums"
            >
              {unreadCount > 0 ? `Notifikasi (${unreadCount})` : 'Notifikasi'}
            </button>
          </nav>

          <div className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setIsNotifDrawerOpen(true)}
              aria-label="Buka notifikasi"
              className="relative rounded-lg p-2 text-white/90 hover:bg-white/10 md:hidden"
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 font-mono text-[10px] font-bold text-[#E31A8D]">
                  {unreadCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => openNewBookingModal(selectedRoom?.id)}
              className="inline-flex whitespace-nowrap shrink-0 items-center gap-2 rounded-lg bg-[#E31A8D] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#c8157b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <CalendarPlus className="h-4 w-4" />
              <span>Booking Ruang</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] space-y-6 px-4 py-6 sm:px-6">
        {toastNotification && (
          <div
            role="status"
            className="flex items-start justify-between gap-4 rounded-xl border border-[#E31A8D]/30 bg-white px-4 py-3.5 shadow-sm"
          >
            <button
              type="button"
              onClick={() => setIsNotifDrawerOpen(true)}
              className="flex items-start gap-3 text-left"
            >
              <Bell className="mt-0.5 h-4 w-4 shrink-0 text-[#E31A8D]" />
              <div>
                <div className="text-xs font-semibold text-[#0E347C]">
                  {toastNotification.title}
                </div>
                <p className="mt-0.5 text-xs text-slate-600">{toastNotification.message}</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setToastNotification(null)}
              aria-label="Tutup notifikasi"
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <section
          aria-label="Pilihan ruang meeting dan waktu"
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 sm:p-6"
        >
          <div className="flex flex-col justify-between gap-4 border-b border-slate-100 pb-4 lg:flex-row lg:items-center">
            <div>
              <h1 className="font-display text-xl font-bold tracking-tight text-[#0E347C] sm:text-2xl">
                Reservasi Ruang Meeting
              </h1>
              <p className="mt-0.5 text-xs text-slate-500">
                Pilih salah satu ruang meeting di bawah untuk melihat jadwal kosong dan melakukan booking.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-5">
              <div className="lg:border-r lg:border-slate-200 lg:pr-5">
                <div className="font-mono text-2xl font-bold tracking-tight text-[#0E347C] tabular-nums">
                  {liveClockString}
                </div>
                <div className="text-xs text-slate-500">{liveDateString}</div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedDate((prev) => shiftDateString(prev, -1))}
                  aria-label="Hari sebelumnya"
                  className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:border-[#0E347C]/40 hover:text-[#0E347C]"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <input
                  type="date"
                  aria-label="Pilih tanggal"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-mono text-xs font-medium text-slate-900 tabular-nums focus:border-[#0E347C] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setSelectedDate((prev) => shiftDateString(prev, 1))}
                  aria-label="Hari berikutnya"
                  className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:border-[#0E347C]/40 hover:text-[#0E347C]"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                {selectedDate !== todayStr && (
                  <button
                    type="button"
                    onClick={() => setSelectedDate(todayStr)}
                    className="whitespace-nowrap shrink-0 rounded-lg border border-[#0E347C]/30 bg-white px-3 py-1.5 text-xs font-medium text-[#0E347C] hover:bg-[#0E347C]/5"
                  >
                    Hari Ini
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {rooms.map((room) => {
              const isSelected = room.id === selectedRoom?.id;
              const activeNow = getRoomActiveBookingNow(room.id);

              return (
                <button
                  key={room.id}
                  type="button"
                  onClick={() => setSelectedRoomId(room.id)}
                  className={`flex flex-col justify-between gap-2 rounded-lg border p-4 text-left transition-colors ${
                    isSelected
                      ? 'border-[#0E347C] bg-[#0E347C]/[0.04]'
                      : 'border-slate-200 bg-white hover:border-[#0E347C]/40'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span
                      className={`font-display text-base font-bold ${
                        isSelected ? 'text-[#0E347C]' : 'text-slate-900'
                      }`}
                    >
                      {room.name}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-semibold ${
                        activeNow ? 'text-[#E31A8D]' : 'text-emerald-700'
                      }`}
                    >
                      {activeNow ? (
                        <>
                          <Clock className="h-3.5 w-3.5" />
                          Booked (s/d {activeNow.endTime})
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Available
                        </>
                      )}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs text-slate-600 tabular-nums">
                    <span className="inline-flex items-center gap-1.5 font-medium text-slate-800">
                      <Users className="h-3.5 w-3.5 text-[#0E347C]" />
                      Kapasitas {room.capacity} orang
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {isLoadingData ? (
          <div className="space-y-4">
            <div className="h-72 animate-pulse rounded-xl border border-slate-200 bg-white" />
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.45fr_1fr]">
              <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-white" />
              <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-white" />
            </div>
          </div>
        ) : (
          <>
            <SlotGrid
              room={selectedRoom}
              bookings={bookings}
              selectedDate={selectedDate}
              nowTick={nowTick}
              onBookSlot={(startTime, endTime) =>
                openNewBookingModal(selectedRoom?.id, startTime, endTime)
              }
              onSelectBooking={(booking) => openEditBookingModal(booking)}
            />

            <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1.45fr_1fr]">
              <section
                id="agenda"
                aria-labelledby="agenda-heading"
                className="rounded-xl border border-slate-200 bg-white"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
                  <div>
                    <h2 id="agenda-heading" className="text-base font-semibold text-[#0E347C]">
                      Agenda Rapat
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {agendaScope === 'date'
                        ? formatDateHeading(selectedDate)
                        : 'Semua jadwal mendatang'}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={agendaSearch}
                        onChange={(e) => setAgendaSearch(e.target.value)}
                        placeholder="Cari judul, ruang, PIC..."
                        className="w-44 rounded-lg border border-slate-200 bg-white py-1.5 pr-2.5 pl-8 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#0E347C] focus:outline-none"
                      />
                    </div>

                    <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1">
                      <button
                        type="button"
                        onClick={() => setAgendaScope('date')}
                        className={`whitespace-nowrap shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                          agendaScope === 'date'
                            ? 'bg-white text-[#0E347C] shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Tanggal Ini
                      </button>
                      <button
                        type="button"
                        onClick={() => setAgendaScope('upcoming')}
                        className={`whitespace-nowrap shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                          agendaScope === 'upcoming'
                            ? 'bg-white text-[#0E347C] shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Mendatang
                      </button>
                    </div>
                  </div>
                </div>

                {agendaBookings.length === 0 ? (
                  <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
                    <p className="text-sm font-medium text-slate-700">
                      Belum ada reservasi terjadwal
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Pilih salah satu jam kosong di atas atau klik tombol di bawah untuk memesan ruangan.
                    </p>
                    <button
                      type="button"
                      onClick={() => openNewBookingModal(selectedRoom?.id)}
                      className="mt-4 rounded-lg bg-[#E31A8D] px-4 py-2 text-xs font-semibold text-white hover:bg-[#c8157b]"
                    >
                      + Booking Ruang
                    </button>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {agendaBookings.map((booking) => {
                      const room = rooms.find((r) => r.id === booking.roomId);
                      const gcalUrl = buildGoogleCalendarTemplateUrl(booking, room);
                      return (
                        <div
                          key={booking.id}
                          className="flex flex-col justify-between gap-3 px-5 py-4 sm:flex-row sm:items-center"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 tabular-nums">
                              <span className="font-mono font-semibold text-[#0E347C]">
                                {booking.startTime}–{booking.endTime}
                              </span>
                              {agendaScope === 'upcoming' && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="font-mono">{booking.date}</span>
                                </>
                              )}
                              <span aria-hidden="true">·</span>
                              <span className="font-medium text-slate-700">
                                {room?.name || 'Ruang Meeting'}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span>{booking.organizerName}</span>
                              <span aria-hidden="true">·</span>
                              <span>H-{booking.reminderMinutes}m</span>
                            </div>

                            <h3 className="mt-1 truncate text-sm font-semibold text-slate-900">
                              {booking.title}
                            </h3>
                            {booking.description && (
                              <p className="mt-0.5 truncate text-xs text-slate-500">
                                {booking.description}
                              </p>
                            )}
                          </div>

                          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                            <a
                              href={gcalUrl}
                              target="_blank"
                              rel="noreferrer"
                              title="Simpan ke Google Calendar"
                              className="inline-flex items-center gap-1 rounded-lg border border-[#0E347C]/25 bg-[#0E347C]/[0.04] px-2.5 py-1.5 text-xs font-medium text-[#0E347C] hover:bg-[#0E347C]/10"
                            >
                              Google Cal
                              <ExternalLink className="h-3 w-3" />
                            </a>
                            <button
                              type="button"
                              onClick={() => downloadBookingIcs(booking, room)}
                              title="Unduh file .ics"
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            >
                              <Download className="h-3.5 w-3.5" />
                              .ics
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditBookingModal(booking)}
                              aria-label={`Edit ${booking.title}`}
                              className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:border-[#0E347C]/40 hover:text-[#0E347C]"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setBookingToCancel(booking)}
                              aria-label={`Batalkan ${booking.title}`}
                              className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50/60 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span>Batalkan</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <div className="space-y-6">
                <MiniCalendarCard
                  selectedDate={selectedDate}
                  todayStr={todayStr}
                  bookings={bookings}
                  onSelectDate={(d) => {
                    setSelectedDate(d);
                    setAgendaScope('date');
                  }}
                />

                <section
                  aria-label="Identitas pemesan default"
                  className="rounded-xl border border-slate-200 bg-white p-5"
                >
                  <h3 className="text-sm font-semibold text-[#0E347C]">
                    Identitas Pemesan Cepat
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Otomatis mengisi form booking tanpa perlu login.
                  </p>
                  <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-1">
                    <input
                      type="text"
                      aria-label="Nama Pemesan"
                      value={userName}
                      onChange={(e) => setUserName(e.target.value)}
                      placeholder="Nama Anda"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#0E347C] focus:outline-none"
                    />
                    <input
                      type="email"
                      aria-label="Email Pemesan"
                      value={userEmail}
                      onChange={(e) => setUserEmail(e.target.value)}
                      placeholder="Email Anda"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#0E347C] focus:outline-none"
                    />
                  </div>
                </section>
              </div>
            </div>
          </>
        )}
      </main>

      <NotificationsDrawer
        isOpen={isNotifDrawerOpen}
        notifications={notifications}
        unreadCount={unreadCount}
        settings={settings}
        browserPermission={browserPermission}
        onClose={() => setIsNotifDrawerOpen(false)}
        onMarkRead={handleMarkNotificationRead}
        onUpdateSettings={handleUpdateNotificationSettings}
        onRequestBrowserPermission={handleRequestBrowserPermission}
        onSendTestNotification={handleSendTestNotification}
      />

      <BookingModal
        isOpen={isBookingModalOpen}
        rooms={rooms}
        existingBookings={bookings}
        initialRoomId={modalInitialRoomId || selectedRoom?.id}
        initialDate={editingBooking ? editingBooking.date : selectedDate}
        initialStartTime={modalInitialStart}
        initialEndTime={modalInitialEnd}
        editingBooking={editingBooking}
        defaultOrganizerName={userName}
        defaultOrganizerEmail={userEmail}
        defaultReminderMinutes={settings.reminderMinutesBefore}
        isSubmitting={isSubmittingBooking}
        serverError={bookingServerError}
        onClose={() => {
          setIsBookingModalOpen(false);
          setEditingBooking(null);
        }}
        onSubmit={handleBookingModalSubmit}
      />

      <ConfirmationModal
        isOpen={Boolean(bookingToCancel)}
        title={`Batalkan reservasi "${bookingToCancel?.title || ''}"?`}
        description="Slot waktu akan langsung dibebaskan sehingga dapat dipesan kembali oleh tim lain."
        details={
          bookingToCancel
            ? [
                `Ruangan: ${cancelRoom ? `${cancelRoom.name} (${cancelRoom.code})` : bookingToCancel.roomId}`,
                `Waktu: ${bookingToCancel.date} · ${bookingToCancel.startTime}–${bookingToCancel.endTime}`,
                `PIC: ${bookingToCancel.organizerName}`,
              ]
            : []
        }
        confirmLabel="Konfirmasi Pembatalan"
        tone="danger"
        isProcessing={isProcessingCancel}
        onConfirm={handleConfirmCancel}
        onCancel={() => setBookingToCancel(null)}
      />
    </div>
  );
}