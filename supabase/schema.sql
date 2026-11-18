-- Jalankan SQL ini di Supabase Dashboard -> SQL Editor

create table if not exists rooms (
  id text primary key,
  code text not null,
  name text not null,
  floor text not null,
  capacity integer not null,
  amenities jsonb not null default '[]'::jsonb,
  description text not null default ''
);

create table if not exists bookings (
  id text primary key,
  room_id text not null references rooms(id) on delete cascade,
  title text not null,
  description text not null default '',
  date text not null,
  start_time text not null,
  end_time text not null,
  organizer_name text not null,
  organizer_email text not null,
  attendees jsonb not null default '[]'::jsonb,
  status text not null default 'confirmed',
  reminder_minutes integer not null default 15,
  reminder_sent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_bookings_room_date_status
  on bookings (room_id, date, status);

create table if not exists notifications (
  id text primary key,
  type text not null,
  title text not null,
  message text not null,
  booking_id text,
  room_name text,
  meeting_date text,
  meeting_time text,
  read boolean not null default false,
  channels jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists notification_settings (
  id integer primary key default 1,
  reminder_minutes_before integer not null default 15,
  desktop_alerts boolean not null default false,
  notify_on_cancellation boolean not null default true
);

-- Karena aplikasi kantor dipakai tanpa login, aktifkan akses publik atau nonaktifkan RLS
alter table rooms disable row level security;
alter table bookings disable row level security;
alter table notifications disable row level security;
alter table notification_settings disable row level security;

-- Seed 2 Ruang Meeting & Pengaturan Default
insert into rooms (id, code, name, floor, capacity, amenities, description)
values
  (
    'room-besar',
    'R-01',
    'Ruang Meeting Besar',
    '',
    11,
    '["Layar Presentasi 4K", "Kamera Konferensi", "Papan Tulis Kaca", "HDMI & USB-C Dock"]'::jsonb,
    'Ruang meeting berkapasitas 11 orang untuk rapat tim, presentasi klien, maupun diskusi lintas divisi.'
  ),
  (
    'room-kecil',
    'R-02',
    'Ruang Meeting Kecil',
    '',
    3,
    '["Monitor Presentasi", "Papan Tulis", "HDMI Dock"]'::jsonb,
    'Ruang meeting ringkas berkapasitas 3 orang untuk diskusi cepat, 1-on-1, atau panggilan daring.'
  )
on conflict (id) do nothing;

insert into notification_settings (id, reminder_minutes_before, desktop_alerts, notify_on_cancellation)
values (1, 15, false, true)
on conflict (id) do nothing;
