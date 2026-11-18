import React, { useMemo, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Copy, Download } from 'lucide-react';
import type { Booking } from '../types/booking';

interface MiniCalendarCardProps {
  selectedDate: string;
  todayStr: string;
  bookings: Booking[];
  onSelectDate: (dateStr: string) => void;
}

const WEEKDAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

function toDateStr(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export const MiniCalendarCard: React.FC<MiniCalendarCardProps> = ({
  selectedDate,
  todayStr,
  bookings,
  onSelectDate,
}) => {
  const [selY, selM] = selectedDate.split('-').map(Number);
  const [viewYear, setViewYear] = useState(selY);
  const [viewMonth, setViewMonth] = useState(selM - 1);
  const [copiedFeed, setCopiedFeed] = useState(false);

  const feedUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/calendar.ics`
      : '/api/calendar.ics';

  const countByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of bookings) {
      if (b.status !== 'confirmed') continue;
      map.set(b.date, (map.get(b.date) || 0) + 1);
    }
    return map;
  }, [bookings]);

  const calendarCells = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells: Array<{ day: number | null; dateStr: string | null }> = [];
    for (let i = 0; i < firstDay; i++) cells.push({ day: null, dateStr: null });
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, dateStr: toDateStr(viewYear, viewMonth, d) });
    }
    return cells;
  }, [viewYear, viewMonth]);

  const monthTitle = new Date(viewYear, viewMonth, 1).toLocaleDateString('id-ID', {
    month: 'long',
    year: 'numeric',
  });

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleCopyFeed = async () => {
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopiedFeed(true);
      setTimeout(() => setCopiedFeed(false), 2500);
    } catch {
      // Ignore clipboard failures
    }
  };

  return (
    <section
      id="kalender"
      aria-labelledby="mini-cal-heading"
      className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5"
    >
      <div>
        <div className="flex items-center justify-between gap-2 pb-3">
          <h2 id="mini-cal-heading" className="text-sm font-semibold capitalize text-[#0E347C]">
            {monthTitle}
          </h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handlePrevMonth}
              aria-label="Bulan sebelumnya"
              className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:border-[#0E347C]/40 hover:text-[#0E347C]"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleNextMonth}
              aria-label="Bulan berikutnya"
              className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:border-[#0E347C]/40 hover:text-[#0E347C]"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 border-b border-slate-100 pb-2 text-center text-[11px] font-medium text-slate-500">
          {WEEKDAYS.map((day) => (
            <div key={day}>{day}</div>
          ))}
        </div>

        <div className="mt-2 grid grid-cols-7 gap-1">
          {calendarCells.map((cell, idx) => {
            if (!cell.day || !cell.dateStr) {
              return <div key={`empty-${idx}`} className="h-10" />;
            }
            const count = countByDate.get(cell.dateStr) || 0;
            const isSelected = cell.dateStr === selectedDate;
            const isTodayCell = cell.dateStr === todayStr;

            return (
              <button
                key={cell.dateStr}
                type="button"
                onClick={() => onSelectDate(cell.dateStr!)}
                className={`flex h-10 flex-col items-center justify-center rounded-lg border font-mono text-xs tabular-nums transition-colors ${
                  isSelected
                    ? 'border-[#0E347C] bg-[#0E347C] font-semibold text-white'
                    : isTodayCell
                    ? 'border-[#E31A8D] bg-[#E31A8D]/5 font-semibold text-[#E31A8D]'
                    : 'border-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-50'
                }`}
              >
                <span>{cell.day}</span>
                {count > 0 && (
                  <span
                    className={`text-[9px] leading-none font-semibold ${
                      isSelected ? 'text-white/90' : 'text-[#E31A8D]'
                    }`}
                  >
                    {count}×
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-5 space-y-2 border-t border-slate-100 pt-4">
        <div className="text-xs font-medium text-slate-700">Sinkronisasi Kalender</div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleCopyFeed}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:border-[#0E347C]/40 hover:text-[#0E347C]"
          >
            {copiedFeed ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-700" />
                Tersalin
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                Salin Feed .ics
              </>
            )}
          </button>
          <a
            href="/api/calendar.ics"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:border-[#0E347C]/40 hover:text-[#0E347C]"
          >
            <Download className="h-3.5 w-3.5" />
            Unduh .ics
          </a>
        </div>
      </div>
    </section>
  );
};
