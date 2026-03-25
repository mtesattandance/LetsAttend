export type UserRole = "super_admin" | "admin" | "employee";

/** Firestore Timestamp or plain seconds (API responses) */
export type FsTime = { seconds: number; nanoseconds: number };

export type UserProfile = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  assignedSites: string[];
  createdAt: FsTime;
};

export type Site = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius: number;
  createdBy: string;
};

export type GpsPoint = {
  latitude: number;
  longitude: number;
  accuracyM?: number;
};

export type AttendanceCheck = {
  time: FsTime;
  gps: GpsPoint;
  photoUrl: string;
};

export type SiteSwitchLog = {
  fromSiteId: string | null;
  toSiteId: string;
  at: FsTime;
};

export type AttendanceStatus = "present" | "half_day" | "absent";

export type AttendanceRecord = {
  workerId: string;
  siteId: string;
  date: string;
  checkIn?: AttendanceCheck;
  checkOut?: AttendanceCheck;
  status: AttendanceStatus;
  siteSwitchLogs: SiteSwitchLog[];
};

export type LiveTrackingDoc = {
  workerId: string;
  location: GpsPoint;
  lastUpdated: FsTime;
};
