export interface Room {
  id: string;
  code: string;
  name: string;
  floor: string;
  capacity: number;
  amenities: string[];
  description: string;
}

export type BookingStatus = 'confirmed' | 'cancelled';

export interface Booking {
  id: string;
  roomId: string;
  title: string;
  description: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  organizerName: string;
  organizerEmail: string;
  attendees: string[];
  status: BookingStatus;
  reminderMinutes: number;
  reminderSent: boolean;
  createdAt: string;
  updatedAt: string;
}

export type NotificationType =
  | 'booking_created'
  | 'booking_updated'
  | 'booking_cancelled'
  | 'meeting_reminder'
  | 'system_test';

export interface NotificationChannelStatus {
  inApp: boolean;
  attendeeCount: number;
  reminderScheduledMinutes?: number;
}

export interface NotificationItem {
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
  channels: NotificationChannelStatus;
}

export interface NotificationSettings {
  reminderMinutesBefore: number;
  desktopAlerts: boolean;
  notifyOnCancellation: boolean;
}
