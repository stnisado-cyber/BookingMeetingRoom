import React, { useMemo } from 'react';
import { CalendarPlus, Clock, Lock } from 'lucide-react';
import type { Booking, Room } from '../types/booking';

interface SlotGridProps {
  room?: Room;
  bookings: Booking[];
  selectedDate: string;
  nowTick: Date;
  onBookSlot: (startTime: string, endTime: string) => void;
  onSelectBooking: (booking: Booking) => void;
}

const HOURS = Array.from({ length: 11 }, (_, i) => 8 + i); // 08:00 - 18:00 (ends 19:00)

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function fmtHour(h: number): string {
  return `${String(h).padStart(2, '0')}:00`;
}

export const SlotGrid: React.FC<SlotGridProps> = ({
  room,
  bookings,
  selectedDate,
  nowTick,
  onBookSlot,
  onSelectBooking,
}) => {
  const targetRoomId = room?.id || 'room-besar';

  const dayBookings = useMemo(
    () =>
      bookings
        .filter(
          (b) =>
            b.roomId === targetRoomId &&
            b.date === selectedDate &&
            b.status === 'confirmed'
        )
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [bookings, targetRoomId, selectedDate]
  );

  const todayStr = `${nowTick.getFullYear()}-${String(nowTick.getMonth() + 1).padStart(
    2,
    '0'
  )}-${String(nowTick.getDate()).padStart(2, '0')}`;
  const isToday = selectedDate === todayStr;
  const nowMinutes = nowTick.getHours() * 60 + nowTick.getMinutes();

  return (
    <section
      id="jadwal"
      aria-labelledby="slot-grid-heading"
      className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 id="slot-grid-heading" className="text-base font-semibold text-[#0E347C]">
            Pilih Jam Kosong — {room?.name || 'Ruang Meeting Besar'} (Kapasitas {room?.capacity || 11} orang)
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Klik slot tersedia untuk langsung booking. Jam yang sudah dipesan otomatis terkunci agar tidak bentrok.
          </p>
        </div>

        <div className="flex items-center gap-5 text-xs text-slate-600">
          <span className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-sm border border-slate-300 bg-white" />
            <span>Available</span>
          </span>
          <span className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-sm border border-[#0E347C]/30 bg-[#0E347C]/10" />
            <span>Booked</span>
          </span>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {HOURS.map((hour) => {
          const slotStart = fmtHour(hour);
          const slotEnd = fmtHour(hour + 1);
          const sMin = toMinutes(slotStart);
          const eMin = toMinutes(slotEnd);

          const blocker = dayBookings.find(
            (b) => sMin < toMinutes(b.endTime) && eMin > toMinutes(b.startTime)
          );
          const isRunningNow = isToday && nowMinutes >= sMin && nowMinutes < eMin;

          if (blocker) {
            return (
              <button
                key={hour}
                type="button"
                onClick={() => onSelectBooking(blocker)}
                title={`Booked (${blocker.startTime}–${blocker.endTime}) oleh ${blocker.organizerName}. Klik untuk melihat atau mengubah.`}
                className={`flex min-h-[96px] flex-col justify-between rounded-lg border p-3.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-[#0E347C] ${
                  isRunningNow
                    ? 'border-[#E31A8D] bg-[#E31A8D]/5 hover:bg-[#E31A8D]/10'
                    : 'border-[#0E347C]/20 bg-[#0E347C]/[0.04] hover:border-[#0E347C]/40'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-semibold text-[#0E347C] tabular-nums">
                    {slotStart}–{slotEnd}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 text-[11px] font-medium ${
                      isRunningNow ? 'text-[#E31A8D]' : 'text-[#0E347C]'
                    }`}
                  >
                    <Lock className="h-3 w-3 shrink-0" />
                    Booked
                  </span>
                </div>

                <div className="mt-2">
                  <div className="truncate text-sm font-semibold text-slate-900">
                    {blocker.title}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-slate-600 tabular-nums">
                    {blocker.organizerName} · {blocker.startTime}–{blocker.endTime}
                  </div>
                </div>
              </button>
            );
          }

          return (
            <button
              key={hour}
              type="button"
              onClick={() => onBookSlot(slotStart, slotEnd)}
              className={`group flex min-h-[96px] flex-col justify-between rounded-lg border p-3.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-[#0E347C] ${
                isRunningNow
                  ? 'border-[#E31A8D]/50 bg-white hover:border-[#E31A8D] hover:bg-[#E31A8D]/[0.04]'
                  : 'border-slate-200 bg-white hover:border-[#0E347C] hover:bg-[#0E347C]/[0.03]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs font-semibold text-slate-800 tabular-nums group-hover:text-[#0E347C]">
                  {slotStart}–{slotEnd}
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                  <Clock className="h-3 w-3 shrink-0" />
                  Available
                </span>
              </div>

              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-500 group-hover:text-[#0E347C]">
                  Klik untuk booking
                </span>
                <CalendarPlus className="h-4 w-4 text-slate-400 transition-colors group-hover:text-[#E31A8D]" />
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
};
