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
import { buildGoogleCalendarTemplateUrl } from './lib/calendarLinks';
import { SlotGrid } from './components/SlotGrid';
import { MiniCalendarCard } from './components/MiniCalendarCard';
import { NotificationsDrawer } from './components/NotificationsDrawer';
import { BookingModal, type BookingFormValues } from './components/BookingModal';
import { ConfirmationModal } from './components/ConfirmationModal';

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

export default function App() {
  const [nowTick, setNowTick] = useState<Date>(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string>(() =>
    formatLocalDateString(new Date())
  );
  const [selectedRoomId, setSelectedRoomId] = useState<string>('room-besar');

  // Simple pre-filled identity (no login required)
  const [userName, setUserName] = useState('Siti Anisah');
  const [userEmail, setUserEmail] = useState('stnisado@gmail.com');

  // Core data from Supabase via backend
  const [rooms, setRooms] = useState<Room[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [settings, setSettings] = useState<NotificationSettings>({
    reminderMinutesBefore: 15,
    desktopAlerts: false,
    notifyOnCancellation: true,
  });
  const [isLoadingData, setIsLoadingData] = useState(true);

  // Agenda list view filter
  const [agendaScope, setAgendaScope] = useState<'date' | 'upcoming'>('date');
  const [agendaSearch, setAgendaSearch] = useState('');

  // Drawer & Modals
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

  // Real-time Toast
  const [toastNotification, setToastNotification] = useState<NotificationItem | null>(null);
  const [browserPermission, setBrowserPermission] = useState<
    NotificationPermission | 'unsupported'
  >(() =>
    typeof window !== 'undefined' && 'Notification' in window
      ? Notification.permission
      : 'unsupported'
  );

  // 1-second real-time clock tick
  useEffect(() => {
    const timer = setInterval(() => {
      setNowTick(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchCoreData = useCallback(async () => {
    try {
      const [roomsRes, bookingsRes, notifRes] = await Promise.all([
        fetch('/api/rooms'),
        fetch('/api/bookings'),
        fetch('/api/notifications'),
      ]);
      if (roomsRes.ok) {
        const d = await roomsRes.json();
        const loadedRooms: Room[] = d.rooms || [];
        setRooms(loadedRooms);
        if (loadedRooms.length > 0 && !loadedRooms.some((r) => r.id === selectedRoomId)) {
          setSelectedRoomId(loadedRooms[0].id);
        }
      }
      if (bookingsRes.ok) {
        const d = await bookingsRes.json();
        setBookings(d.bookings || []);
      }
      if (notifRes.ok) {
        const d = await notifRes.json();
        setNotifications(d.notifications || []);
        setUnreadCount(d.unreadCount || 0);
        if (d.settings) setSettings(d.settings);
      }
    } catch (err) {
      console.error('Failed to load workspace data:', err);
    } finally {
      setIsLoadingData(false);
    }
  }, [selectedRoomId]);

  useEffect(() => {
    fetchCoreData();
  }, [fetchCoreData]);

  // Real-time SSE listener
  useEffect(() => {
    const es = new EventSource('/api/notifications/stream');
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'bookings_sync' && Array.isArray(data.bookings)) {
          setBookings(data.bookings);
        } else if (data.type === 'notification' && data.notification) {
          const item = data.notification as NotificationItem;
          setNotifications((prev) => {
            if (prev.some((n) => n.id === item.id)) return prev;
            return [item, ...prev].slice(0, 100);
          });
          setUnreadCount((c) => c + 1);
          setToastNotification(item);

          if (
            typeof window !== 'undefined' &&
            'Notification' in window &&
            Notification.permission === 'granted' &&
            settings.desktopAlerts
          ) {
            new Notification(item.title, { body: item.message });
          }
        }
      } catch {
        // Ignore keepalive frames
      }
    };
    return () => {
      es.close();
    };
  }, [settings.desktopAlerts]);

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

  const handleBookingModalSubmit = async (values: BookingFormValues) => {
    setIsSubmittingBooking(true);
    setBookingServerError(null);
    try {
      const url = editingBooking ? `/api/bookings/${editingBooking.id}` : '/api/bookings';
      const method = editingBooking ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      const data = await res.json();
      if (!res.ok) {
        setBookingServerError(data.error || 'Gagal menyimpan reservasi.');
        return;
      }

      setSelectedRoomId(values.roomId);
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
      const res = await fetch(`/api/bookings/${bookingToCancel.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
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
    const res = await fetch('/api/notifications/mark-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, all }),
    });
    if (res.ok) {
      const data = await res.json();
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    }
  };

  const handleUpdateNotificationSettings = async (patch: Partial<NotificationSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
    await fetch('/api/notifications/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
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
    await fetch('/api/notifications/test', { method: 'POST' });
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
      {/* Strict 3-Zone Top Bar in Brand Navy #0E347C */}
      <header className="sticky top-0 z-30 border-b border-[#0E347C] bg-[#0E347C] text-white">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-8 px-4 sm:px-6">
          {/* Zone 1: Brand Title */}
          <a
            href="#jadwal"
            onClick={(e) => {
              e.preventDefault();
              scrollToSection('jadwal');
            }}
            className="whitespace-nowrap shrink-0 font-display text-lg font-bold tracking-tight text-white"
          >
            RuangKantor
          </a>

          {/* Zone 2: Concise Single-Line Nav Links */}
          <nav
            aria-label="Navigasi utama"
            className="hidden items-center gap-7 text-sm font-medium text-white/85 md:flex"
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

          {/* Zone 3: Single Primary Action in Brand Magenta #E31A8D */}
          <div className="flex items-center gap-3 shrink-0">
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
        {/* Real-Time Toast Banner */}
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

        {/* Top Bar: 2 Meeting Rooms Switcher + Real-Time Clock & Date Picker */}
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
              {/* Live Clock */}
              <div className="lg:border-r lg:border-slate-200 lg:pr-5">
                <div className="font-mono text-2xl font-bold tracking-tight text-[#0E347C] tabular-nums">
                  {liveClockString}
                </div>
                <div className="text-xs text-slate-500">{liveDateString}</div>
              </div>

              {/* Date Switcher */}
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

          {/* 2 Room Selector Cards (No Photos, No Lantai 1) */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {rooms.map((room) => {
              const isSelected = room.id === selectedRoom?.id;
              const activeNow = getRoomActiveBookingNow(room.id);
              const dayCount = bookings.filter(
                (b) =>
                  b.roomId === room.id &&
                  b.date === selectedDate &&
                  b.status === 'confirmed'
              ).length;

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

                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 tabular-nums">
                    <span className="inline-flex items-center gap-1 font-medium text-slate-800">
                      <Users className="h-3.5 w-3.5 text-[#0E347C]" />
                      Kapasitas {room.capacity} orang
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{room.amenities.slice(0, 2).join(' · ')}</span>
                    <span aria-hidden="true">·</span>
                    <span>{dayCount} jadwal pada tanggal ini</span>
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
            {/* Primary Slot Grid (08:00 - 19:00) for Selected Room */}
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

            {/* Two-Column Lower Section: Agenda List + Mini Calendar & Quick Identity */}
            <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1.45fr_1fr]">
              {/* Left: Simple Agenda List with Calendar Export & Edit/Cancel */}
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

                          <div className="flex shrink-0 items-center gap-1.5">
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
                            <a
                              href={`/api/bookings/${booking.id}/ics`}
                              title="Unduh file .ics"
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            >
                              <Download className="h-3.5 w-3.5" />
                              .ics
                            </a>
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
                              className="rounded-lg border border-red-200 bg-white p-1.5 text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Right: Mini Calendar + Quick Identity */}
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
