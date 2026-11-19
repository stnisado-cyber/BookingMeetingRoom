import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, BellRing, Lock, Plus, X } from 'lucide-react';
import type { Booking, Room } from '../types/booking';

export interface BookingFormValues {
  roomId: string;
  title: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  organizerName: string;
  organizerEmail: string;
  attendees: string[];
  reminderMinutes: number;
}

interface BookingModalProps {
  isOpen: boolean;
  rooms: Room[];
  existingBookings: Booking[];
  initialRoomId?: string;
  initialDate: string;
  initialStartTime?: string;
  initialEndTime?: string;
  editingBooking?: Booking | null;
  defaultOrganizerName: string;
  defaultOrganizerEmail: string;
  defaultReminderMinutes: number;
  isSubmitting: boolean;
  serverError: string | null;
  onClose: () => void;
  onSubmit: (values: BookingFormValues) => void;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

const TIME_OPTIONS = Array.from({ length: 23 }, (_, idx) => {
  const totalMin = 8 * 60 + idx * 30;
  const hh = String(Math.floor(totalMin / 60)).padStart(2, '0');
  const mm = String(totalMin % 60).padStart(2, '0');
  return `${hh}:${mm}`;
});

export const BookingModal: React.FC<BookingModalProps> = ({
  isOpen,
  rooms,
  existingBookings,
  initialRoomId,
  initialDate,
  initialStartTime,
  initialEndTime,
  editingBooking,
  defaultOrganizerName,
  defaultOrganizerEmail,
  defaultReminderMinutes,
  isSubmitting,
  serverError,
  onClose,
  onSubmit,
}) => {
  const [roomId, setRoomId] = useState<string>(
    editingBooking?.roomId || initialRoomId || rooms[0]?.id || 'room-besar'
  );
  const activeRoom = rooms.find((r) => r.id === roomId) || rooms[0];

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(initialDate);
  const [startTime, setStartTime] = useState(initialStartTime || '09:00');
  const [endTime, setEndTime] = useState(initialEndTime || '10:00');
  const [organizerName, setOrganizerName] = useState(defaultOrganizerName);
  const [organizerEmail, setOrganizerEmail] = useState(defaultOrganizerEmail);
  const [attendees, setAttendees] = useState<string[]>([]);
  const [attendeeInput, setAttendeeInput] = useState('');
  const [reminderMinutes, setReminderMinutes] = useState(defaultReminderMinutes);
  const [localError, setLocalError] = useState<string | null>(null);

  const dayConfirmedBookings = useMemo(() => {
    return existingBookings
      .filter((b) => {
        if (b.status === 'cancelled') return false;
        if (editingBooking && b.id === editingBooking.id) return false;
        return b.roomId === roomId && b.date === date;
      })
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [existingBookings, roomId, date, editingBooking]);

  const isStartSlotBlocked = (slotStart: string): Booking | undefined => {
    const startMin = toMinutes(slotStart);
    return dayConfirmedBookings.find(
      (b) => startMin >= toMinutes(b.startTime) && startMin < toMinutes(b.endTime)
    );
  };

  const isRangeBlocked = (rangeStart: string, rangeEnd: string): Booking | undefined => {
    const sMin = toMinutes(rangeStart);
    const eMin = toMinutes(rangeEnd);
    if (eMin <= sMin) return undefined;
    return dayConfirmedBookings.find(
      (b) => sMin < toMinutes(b.endTime) && eMin > toMinutes(b.startTime)
    );
  };

  const findFirstAvailableSlot = (
    targetRoomId: string,
    targetDate: string
  ): { start: string; end: string } => {
    const bookingsForDate = existingBookings.filter(
      (b) =>
        b.status !== 'cancelled' &&
        b.roomId === targetRoomId &&
        b.date === targetDate &&
        (!editingBooking || b.id !== editingBooking.id)
    );
    // Try finding a 60-minute open window first, then 30-minute
    for (const duration of [60, 30]) {
      for (let i = 0; i < TIME_OPTIONS.length - 1; i++) {
        const s = TIME_OPTIONS[i];
        const sMin = toMinutes(s);
        const eMin = sMin + duration;
        if (eMin > 19 * 60) continue;
        const eh = String(Math.floor(eMin / 60)).padStart(2, '0');
        const em = String(eMin % 60).padStart(2, '0');
        const e = `${eh}:${em}`;
        const conflict = bookingsForDate.some(
          (b) => sMin < toMinutes(b.endTime) && eMin > toMinutes(b.startTime)
        );
        if (!conflict) return { start: s, end: e };
      }
    }
    return { start: '09:00', end: '10:00' };
  };

  useEffect(() => {
    if (!isOpen) return;
    setLocalError(null);
    const nextRoomId = editingBooking?.roomId || initialRoomId || rooms[0]?.id || 'room-besar';
    setRoomId(nextRoomId);

    if (editingBooking) {
      setTitle(editingBooking.title);
      setDescription(editingBooking.description);
      setDate(editingBooking.date);
      setStartTime(editingBooking.startTime);
      setEndTime(editingBooking.endTime);
      setOrganizerName(editingBooking.organizerName);
      setOrganizerEmail(editingBooking.organizerEmail);
      setAttendees(editingBooking.attendees);
      setReminderMinutes(editingBooking.reminderMinutes || defaultReminderMinutes);
    } else {
      setTitle('');
      setDescription('');
      setDate(initialDate);
      if (initialStartTime && initialEndTime) {
        setStartTime(initialStartTime);
        setEndTime(initialEndTime);
      } else {
        const free = findFirstAvailableSlot(nextRoomId, initialDate);
        setStartTime(free.start);
        setEndTime(free.end);
      }
      setOrganizerName(defaultOrganizerName);
      setOrganizerEmail(defaultOrganizerEmail);
      setAttendees(defaultOrganizerEmail ? [defaultOrganizerEmail] : []);
      setReminderMinutes(defaultReminderMinutes);
    }
    setAttendeeInput('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editingBooking, initialRoomId, initialDate, initialStartTime, initialEndTime]);

  const handleRoomChange = (nextRoomId: string) => {
    setRoomId(nextRoomId);
    setLocalError(null);
    if (!editingBooking) {
      const free = findFirstAvailableSlot(nextRoomId, date);
      setStartTime(free.start);
      setEndTime(free.end);
    }
  };

  const handleDateChange = (nextDate: string) => {
    setDate(nextDate);
    setLocalError(null);
    if (!editingBooking) {
      const free = findFirstAvailableSlot(roomId, nextDate);
      setStartTime(free.start);
      setEndTime(free.end);
    }
  };

  const handleStartTimeChange = (nextStart: string) => {
    setStartTime(nextStart);
    setLocalError(null);
    const sMin = toMinutes(nextStart);
    // Ensure endTime is after startTime and doesn't cross an existing booking
    const currentEMin = toMinutes(endTime);
    if (currentEMin <= sMin || isRangeBlocked(nextStart, endTime)) {
      const nextValidEnd = TIME_OPTIONS.slice(1).find(
        (t) => toMinutes(t) > sMin && !isRangeBlocked(nextStart, t)
      );
      if (nextValidEnd) {
        setEndTime(nextValidEnd);
      }
    }
  };

  const roomConflict = useMemo(() => {
    if (!roomId || !date || !startTime || !endTime) return undefined;
    if (toMinutes(endTime) <= toMinutes(startTime)) return undefined;
    return isRangeBlocked(startTime, endTime);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayConfirmedBookings, roomId, date, startTime, endTime]);

  if (!isOpen) return null;

  const handleAddAttendee = () => {
    const raw = attendeeInput.trim();
    if (!raw) return;
    const parts = raw
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter((s) => s.includes('@'));
    if (parts.length === 0) {
      setLocalError('Masukkan alamat email peserta yang valid.');
      return;
    }
    setLocalError(null);
    setAttendees((prev) => Array.from(new Set([...prev, ...parts])));
    setAttendeeInput('');
  };

  const handleRemoveAttendee = (email: string) => {
    setAttendees((prev) => prev.filter((item) => item !== email));
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setLocalError('Judul rapat wajib diisi.');
      return;
    }
    if (toMinutes(endTime) <= toMinutes(startTime)) {
      setLocalError('Jam selesai harus lebih besar daripada jam mulai.');
      return;
    }
    if (roomConflict) {
      setLocalError(
        `Tidak dapat memesan: jam ${roomConflict.startTime}–${roomConflict.endTime} sudah dibooking oleh ${roomConflict.organizerName} (${roomConflict.title}).`
      );
      return;
    }
    setLocalError(null);

    const pendingAttendees = attendeeInput
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter((s) => s.includes('@'));
    const finalAttendees = Array.from(new Set([...attendees, ...pendingAttendees]));

    onSubmit({
      roomId,
      title: title.trim(),
      description: description.trim(),
      date,
      startTime,
      endTime,
      organizerName: organizerName.trim() || 'Pengguna Kantor',
      organizerEmail: organizerEmail.trim() || 'pengguna@perusahaan.id',
      attendees: finalAttendees,
      reminderMinutes,
    });
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="booking-modal-title"
    >
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 id="booking-modal-title" className="text-lg font-semibold text-slate-900">
              {editingBooking ? 'Edit Reservasi Ruang Meeting' : 'Booking Ruang Meeting'}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {activeRoom
                ? `${activeRoom.name} (${activeRoom.code} · Kapasitas ${activeRoom.capacity} orang)`
                : 'Notifikasi & pengingat otomatis dikirim secara real-time.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup modal"
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-2 focus-visible:outline-[#0E347C]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleFormSubmit} className="space-y-5 px-6 py-5">
          {(localError || serverError) && (
            <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              <span>{localError || serverError}</span>
            </div>
          )}

          {rooms.length > 0 && (
            <div>
              <span className="block text-xs font-medium text-slate-700">
                Pilih Ruang Meeting
              </span>
              <div className="mt-1.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {rooms.map((r) => {
                  const isSelected = r.id === roomId;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => handleRoomChange(r.id)}
                      className={`rounded-lg border px-3.5 py-2.5 text-left transition-colors ${
                        isSelected
                          ? 'border-[#0E347C] bg-[#0E347C]/[0.06]'
                          : 'border-slate-200 bg-white hover:border-[#0E347C]/40'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`text-sm font-semibold ${
                            isSelected ? 'text-[#0E347C]' : 'text-slate-900'
                          }`}
                        >
                          {r.name}
                        </span>
                        <span className="font-mono text-xs text-slate-500">{r.code}</span>
                      </div>
                      <div className="mt-0.5 text-xs text-slate-600">
                        Kapasitas {r.capacity} orang
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="booking-date" className="block text-xs font-medium text-slate-700">
                Tanggal Rapat
              </label>
              <input
                id="booking-date"
                type="date"
                value={date}
                onChange={(e) => handleDateChange(e.target.value)}
                required
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 tabular-nums focus:border-[#0E347C] focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="booking-reminder" className="block text-xs font-medium text-slate-700">
                Pengingat Otomatis
              </label>
              <select
                id="booking-reminder"
                value={reminderMinutes}
                onChange={(e) => setReminderMinutes(Number(e.target.value))}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0E347C] focus:outline-none"
              >
                <option value={5}>5 menit sebelum</option>
                <option value={10}>10 menit sebelum</option>
                <option value={15}>15 menit sebelum</option>
                <option value={30}>30 menit sebelum</option>
                <option value={60}>1 jam sebelum</option>
              </select>
            </div>
          </div>

          {/* Visual Quick Slot Picker showing Locked vs Available Times */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-700">
                Pilih Jam Mulai Tersedia ({date})
              </span>
              <span className="text-[11px] text-slate-500">
                Jam yang sudah dibooking otomatis dikunci
              </span>
            </div>
            <div className="mt-2.5 grid grid-cols-4 gap-1.5 sm:grid-cols-6">
              {TIME_OPTIONS.slice(0, -1).map((slot) => {
                const blocker = isStartSlotBlocked(slot);
                const isSelected = startTime === slot && !blocker;
                return (
                  <button
                    key={slot}
                    type="button"
                    disabled={Boolean(blocker)}
                    onClick={() => handleStartTimeChange(slot)}
                    title={
                      blocker
                        ? `Sudah dibooking oleh ${blocker.organizerName} (${blocker.startTime}–${blocker.endTime})`
                        : `Pilih jam mulai ${slot}`
                    }
                    className={`flex items-center justify-center gap-1 rounded-md border px-2 py-1.5 font-mono text-xs tabular-nums transition-colors ${
                      blocker
                        ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 line-through'
                        : isSelected
                        ? 'border-[#0E347C] bg-[#0E347C] font-medium text-white'
                        : 'border-slate-200 bg-white text-slate-800 hover:border-[#0E347C]/50 hover:bg-[#0E347C]/5'
                    }`}
                  >
                    {blocker && <Lock className="h-2.5 w-2.5 shrink-0" />}
                    <span>{slot}</span>
                  </button>
                );
              })}
            </div>

            {dayConfirmedBookings.length > 0 && (
              <div className="mt-3 border-t border-slate-200 pt-2.5 text-xs text-slate-600">
                <span className="font-medium text-slate-700">Jam terkunci pada {date}: </span>
                <span className="font-mono tabular-nums">
                  {dayConfirmedBookings
                    .map((b) => `${b.startTime}–${b.endTime} (${b.organizerName})`)
                    .join(' · ')}
                </span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="booking-start" className="block text-xs font-medium text-slate-700">
                Jam Mulai
              </label>
              <select
                id="booking-start"
                value={startTime}
                onChange={(e) => handleStartTimeChange(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 tabular-nums focus:border-[#0E347C] focus:outline-none"
              >
                {TIME_OPTIONS.slice(0, -1).map((t) => {
                  const blocker = isStartSlotBlocked(t);
                  return (
                    <option key={t} value={t} disabled={Boolean(blocker)}>
                      {blocker ? `${t} — Booked` : t}
                    </option>
                  );
                })}
              </select>
            </div>

            <div>
              <label htmlFor="booking-end" className="block text-xs font-medium text-slate-700">
                Jam Selesai
              </label>
              <select
                id="booking-end"
                value={endTime}
                onChange={(e) => {
                  setEndTime(e.target.value);
                  setLocalError(null);
                }}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 tabular-nums focus:border-[#0E347C] focus:outline-none"
              >
                {TIME_OPTIONS.slice(1).map((t) => {
                  const invalidOrder = toMinutes(t) <= toMinutes(startTime);
                  const blocker = !invalidOrder ? isRangeBlocked(startTime, t) : undefined;
                  return (
                    <option
                      key={t}
                      value={t}
                      disabled={invalidOrder || Boolean(blocker)}
                    >
                      {blocker ? `${t} — Bentrok (${blocker.startTime})` : t}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          {roomConflict && (
            <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              <span>
                Slot terkunci: ruangan sudah dibooking pada{' '}
                <strong className="font-mono">
                  {roomConflict.startTime}–{roomConflict.endTime}
                </strong>{' '}
                oleh {roomConflict.organizerName} ({roomConflict.title}). Silakan pilih jam lain.
              </span>
            </div>
          )}

          <div>
            <label htmlFor="booking-title" className="block text-xs font-medium text-slate-700">
              Judul & Topik Rapat
            </label>
            <input
              id="booking-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Contoh: Sinkronisasi Produk Q4 & Review Infrastruktur"
              required
              maxLength={120}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0E347C] focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="booking-desc" className="block text-xs font-medium text-slate-700">
              Agenda / Catatan Tambahan (Opsional)
            </label>
            <textarea
              id="booking-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Tulis poin agenda atau kebutuhan perlengkapan tambahan..."
              maxLength={500}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0E347C] focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="booking-org-name" className="block text-xs font-medium text-slate-700">
                Nama Penanggung Jawab
              </label>
              <input
                id="booking-org-name"
                type="text"
                value={organizerName}
                onChange={(e) => setOrganizerName(e.target.value)}
                required
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0E347C] focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="booking-org-email" className="block text-xs font-medium text-slate-700">
                Email Penanggung Jawab
              </label>
              <input
                id="booking-org-email"
                type="email"
                value={organizerEmail}
                onChange={(e) => setOrganizerEmail(e.target.value)}
                required
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0E347C] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label htmlFor="booking-attendees" className="block text-xs font-medium text-slate-700">
              Daftar Peserta (Opsional · tersertakan di file kalender)
            </label>
            <div className="mt-1.5 flex gap-2">
              <input
                id="booking-attendees"
                type="text"
                value={attendeeInput}
                onChange={(e) => setAttendeeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    handleAddAttendee();
                  }
                }}
                placeholder="Ketik email lalu tekan Enter (mis. budi@perusahaan.id)"
                className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0E347C] focus:outline-none"
              />
              <button
                type="button"
                onClick={handleAddAttendee}
                className="inline-flex whitespace-nowrap shrink-0 items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <Plus className="h-3.5 w-3.5" />
                Tambah
              </button>
            </div>
            {attendees.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {attendees.map((email) => (
                  <span
                    key={email}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700"
                  >
                    <span>{email}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveAttendee(email)}
                      aria-label={`Hapus ${email}`}
                      className="text-slate-400 hover:text-slate-700"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-4 border-t border-slate-200 pt-4">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <BellRing className="h-3.5 w-3.5 text-[#0E347C]" />
              <span>Notifikasi real-time aktif otomatis</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="whitespace-nowrap shrink-0 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isSubmitting || Boolean(roomConflict)}
                className="whitespace-nowrap shrink-0 rounded-lg bg-[#E31A8D] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#c8157b] disabled:opacity-50"
              >
                {isSubmitting
                  ? 'Menyimpan...'
                  : editingBooking
                  ? 'Simpan Perubahan'
                  : 'Konfirmasi Booking'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
