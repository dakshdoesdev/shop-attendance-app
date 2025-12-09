import type session from "express-session";
import type {
  User,
  InsertUser,
  AttendanceRecord,
  InsertAttendanceRecord,
  AudioRecording,
  InsertAudioRecording,
  MonthlyWorkHoursResponse,
  EmployeeWorkHours,
  DailyWorkHours,
} from "@shared/schema";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Attendance methods
  createAttendanceRecord(record: InsertAttendanceRecord): Promise<AttendanceRecord>;
  updateAttendanceRecord(id: string, record: Partial<AttendanceRecord>): Promise<AttendanceRecord | undefined>;
  getAttendanceRecordsByUserId(userId: string): Promise<AttendanceRecord[]>;
  getTodayAttendanceRecord(userId: string, date: string): Promise<AttendanceRecord | undefined>;
  getAllTodayAttendance(date: string): Promise<(AttendanceRecord & { user: User })[]>;

  // Audio methods
  createAudioRecording(recording: InsertAudioRecording): Promise<AudioRecording>;
  updateAudioRecording(id: string, recording: Partial<AudioRecording>): Promise<AudioRecording | undefined>;
  getAudioRecordingById(id: string): Promise<AudioRecording | undefined>;
  getActiveAudioRecordingByAttendance(attendanceId: string): Promise<AudioRecording | undefined>;
  getAudioRecordingByUserAndDate(userId: string, date: string): Promise<AudioRecording | undefined>;
  getTotalAudioStorage(): Promise<number>;
  getOldestAudioRecording(): Promise<AudioRecording | undefined>;
  enforceAudioStorageLimit(maxBytes: number): Promise<void>;
  getAudioRecordingsByUserId(userId: string): Promise<AudioRecording[]>;
  getAllAudioRecordings(): Promise<(AudioRecording & { user: User })[]>;
  getActiveAudioRecordings(): Promise<(AudioRecording & { user: User })[]>;
  deleteAudioRecording(id: string): Promise<void>;
  deleteOldAudioRecordings(daysOld: number): Promise<void>;

  // Admin methods
  getAllUsers(): Promise<User[]>;
  updateUser(id: string, user: Partial<User>): Promise<User | undefined>;
  deleteUser(id: string): Promise<void>;
  getMonthlyWorkHours(month: string): Promise<MonthlyWorkHoursResponse>;

  sessionStore: session.Store;
}

export let storage: IStorage;

const preferMemory = (process.env.USE_MEMORY_STORE || '').toLowerCase() === 'true';

if (!preferMemory && process.env.DATABASE_URL) {
  try {
    const mod = await import("./storage.db");
    storage = mod.storage;
  } catch (err) {
    console.warn('[storage] DB init failed, falling back to in-memory store:', (err as Error)?.message || err);
    const mod = await import("./storage.memory");
    storage = mod.storage;
  }
} else {
  const mod = await import("./storage.memory");
  storage = mod.storage;
}
