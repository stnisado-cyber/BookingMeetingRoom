import React from 'react';
import { Bell, Check, CheckCheck, Clock, Send, X, XCircle } from 'lucide-react';
import type { NotificationItem, NotificationSettings } from '../types/booking';

interface NotificationsDrawerProps {
  isOpen: boolean;
  notifications: NotificationItem[];
  unreadCount: number;
  settings: NotificationSettings;
  browserPermission: NotificationPermission | 'unsupported';
  onClose: () => void;
  onMarkRead: (id?: string, all?: boolean) => void;
  onUpdateSettings: (patch: Partial<NotificationSettings>) => void;
  onRequestBrowserPermission: () => void;
  onSendTestNotification: () => void;
}

function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const NotificationsDrawer: React.FC<NotificationsDrawerProps> = ({
  isOpen,
  notifications,
  unreadCount,
  settings,
  browserPermission,
  onClose,
  onMarkRead,
  onUpdateSettings,
  onRequestBrowserPermission,
  onSendTestNotification,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/45 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="notif-drawer-title"
    >
      <div className="flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="notif-drawer-title" className="text-base font-semibold text-[#0E347C]">
              Notifikasi Otomatis
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
              {unreadCount} belum dibaca · Pengingat H-{settings.reminderMinutesBefore} menit
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup panel notifikasi"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Settings Strip */}
        <div className="space-y-3 border-b border-slate-200 bg-slate-50/70 px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="drawer-reminder" className="text-xs font-medium text-slate-700">
              Pengingat sebelum rapat
            </label>
            <select
              id="drawer-reminder"
              value={settings.reminderMinutesBefore}
              onChange={(e) =>
                onUpdateSettings({ reminderMinutesBefore: Number(e.target.value) })
              }
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-900 focus:border-[#0E347C] focus:outline-none"
            >
              <option value={5}>5 menit</option>
              <option value={10}>10 menit</option>
              <option value={15}>15 menit</option>
              <option value={30}>30 menit</option>
              <option value={60}>1 jam</option>
            </select>
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-medium text-slate-700">Notifikasi Desktop Browser</span>
            {browserPermission === 'granted' ? (
              <input
                type="checkbox"
                checked={settings.desktopAlerts}
                onChange={(e) => onUpdateSettings({ desktopAlerts: e.target.checked })}
                className="h-4 w-4 accent-[#E31A8D]"
              />
            ) : (
              <button
                type="button"
                disabled={browserPermission === 'denied' || browserPermission === 'unsupported'}
                onClick={onRequestBrowserPermission}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-[#0E347C] hover:bg-slate-50 disabled:opacity-50"
              >
                Aktifkan
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={onSendTestNotification}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#0E347C]/30 bg-white px-3 py-1.5 text-xs font-medium text-[#0E347C] hover:bg-[#0E347C]/5"
            >
              <Send className="h-3.5 w-3.5" />
              Kirim Uji Notifikasi
            </button>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => onMarkRead(undefined, true)}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Baca Semua
              </button>
            )}
          </div>
        </div>

        {/* Feed */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <Bell className="h-7 w-7 text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-700">Belum ada notifikasi</p>
              <p className="mt-1 text-xs text-slate-500">
                Notifikasi otomatis akan muncul saat ada reservasi, pembatalan, atau pengingat rapat.
              </p>
            </div>
          ) : (
            notifications.map((item) => {
              const isReminder = item.type === 'meeting_reminder';
              const isCancelled = item.type === 'booking_cancelled';

              return (
                <div
                  key={item.id}
                  className={`px-5 py-4 ${!item.read ? 'bg-[#0E347C]/[0.03]' : 'bg-white'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs">
                        <span
                          className={`inline-flex items-center gap-1 font-medium ${
                            isCancelled
                              ? 'text-red-700'
                              : isReminder
                              ? 'text-[#E31A8D]'
                              : 'text-[#0E347C]'
                          }`}
                        >
                          {isCancelled ? (
                            <XCircle className="h-3.5 w-3.5" />
                          ) : isReminder ? (
                            <Clock className="h-3.5 w-3.5" />
                          ) : (
                            <Check className="h-3.5 w-3.5" />
                          )}
                          {isCancelled
                            ? 'Pembatalan'
                            : isReminder
                            ? 'Pengingat'
                            : 'Reservasi'}
                        </span>
                        <span aria-hidden="true" className="text-slate-300">
                          ·
                        </span>
                        <span className="font-mono text-slate-500 tabular-nums">
                          {formatTime(item.createdAt)}
                        </span>
                      </div>
                      <h3 className="mt-1 text-sm font-semibold text-slate-900">{item.title}</h3>
                      <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
                        {item.message}
                      </p>
                    </div>
                    {!item.read && (
                      <button
                        type="button"
                        onClick={() => onMarkRead(item.id, false)}
                        className="shrink-0 text-xs font-medium text-[#E31A8D] hover:underline"
                      >
                        Tandai
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
