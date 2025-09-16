import type { Express } from "express";
import type { Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { hashPassword } from "./auth";
import { storage } from "./storage";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import jwt from "jsonwebtoken";
import { dirname } from "path";
import { spawn } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


// Resolve base directory for audio storage (override via AUDIO_UPLOAD_DIR)
function getAudioBaseDir() {
  const override = process.env.AUDIO_UPLOAD_DIR;
  if (override && override.trim()) {
    try { fs.mkdirSync(override, { recursive: true }); } catch {}
    return override;
  }
  const def = path.join(__dirname, 'uploads', 'audio');
  try { fs.mkdirSync(def, { recursive: true }); } catch {}
  return def;
}

// Configure multer for audio file uploads
const audioStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const userId = req.user?.id || 'unknown';
    const uploadPath = path.join(getAudioBaseDir(), userId);
    fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const date = new Date().toISOString().split('T')[0];
    const timestamp = Date.now();
    const mime = (file.mimetype || '').toLowerCase();
    const originalExt = path.extname(file.originalname || '').toLowerCase();
    let ext = '.webm';
    if (mime.includes('audio/mp4')) ext = '.mp4';
    else if (mime.includes('audio/m4a')) ext = '.m4a';
    else if (mime.includes('audio/ogg')) ext = '.ogg';
    else if (originalExt) ext = originalExt;
    cb(null, `${date}-${timestamp}${ext}`);
  }
});

const upload = multer({ 
  storage: audioStorage,
  // Raise limit to support long Android background recordings (lower bitrate used on-device)
  limits: { fileSize: 200 * 1024 * 1024 } // 200MB limit
});

export function registerRoutes(app: Express, httpServer: Server) {
  // Health check (DB + session)
  app.get("/api/health", async (req, res) => {
    // If DATABASE_URL is configured, try a lightweight DB ping; otherwise, report db=false
    if (process.env.DATABASE_URL) {
      try {
        const { pool } = await import("./db");
        await pool.query("select 1");
        const auth = req.isAuthenticated();
        res.json({ ok: true, db: true, authenticated: auth, user: auth ? req.user : null });
      } catch (e: any) {
        res.status(500).json({ ok: false, db: false, error: e?.message || String(e) });
      }
      return;
    }
    const auth = req.isAuthenticated();
    res.json({ ok: true, db: false, authenticated: auth, user: auth ? req.user : null });
  });

  // WebSocket server for real-time audio control
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  wss.on('connection', (ws, req) => {
    console.log('WebSocket client connected');
    
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        
        // Broadcast to all connected clients
        wss.clients.forEach((client) => {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
          }
        });
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    });

    ws.on('close', () => {
      console.log('WebSocket client disconnected');
    });
  });

  // Employee attendance routes
  app.post("/api/attendance/checkin", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "employee") {
      return res.status(401).json({ message: "Employee access required" });
    }

    try {
      const { latitude, longitude } = req.body;
      const userId = req.user.id;
      const today = new Date().toISOString().split('T')[0];
      
      // Check if already checked in today
      const existingRecord = await storage.getTodayAttendanceRecord(userId, today);
      if (existingRecord) {
        return res.status(400).json({ message: "Attendance already recorded for today" });
      }

      // GPS validation - COMPLETELY DISABLED FOR TESTING
      console.log(`✅ Check-in allowed from anywhere - Location: ${latitude}, ${longitude}`);
      
      const checkInTime = new Date();
      // Determine expected start time from user profile (HH:MM, 24h). Fallback 09:15
      const user = await storage.getUser(userId);
      const expectedStart = (user?.defaultStartTime && typeof user.defaultStartTime === 'string') ? user.defaultStartTime : '09:15';
      const [sh, sm] = expectedStart.split(':').map((v) => parseInt(v, 10));
      const isLate = checkInTime.getHours() > (sh || 9) || (checkInTime.getHours() === (sh || 9) && checkInTime.getMinutes() > (sm || 15));

      const attendanceRecord = await storage.createAttendanceRecord({
        userId,
        checkInTime,
        date: today,
        isLate,
        isEarlyLeave: false,
      });

      // Ensure only one audio record per user per day
      const existingAudio = await storage.getAudioRecordingByUserAndDate(userId, today);
      const audioRecording = existingAudio
        ? await storage.updateAudioRecording(existingAudio.id, { isActive: true })
        : await storage.createAudioRecording({
            userId,
            attendanceId: attendanceRecord.id,
            recordingDate: today,
            isActive: true,
          });

      // Notify connected dashboards about new recording session
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: "audio_start", recording: audioRecording }));
        }
      });

      console.log(`✅ Check-in completed - audio recording will start`);
      res.status(201).json(attendanceRecord);
    } catch (error) {
      console.error('Check-in error:', error);
      res.status(500).json({ message: "Failed to check in" });
    }
  });

  app.post("/api/attendance/checkout", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "employee") {
      return res.status(401).json({ message: "Employee access required" });
    }

    try {
      const userId = req.user.id;
      const today = new Date().toISOString().split('T')[0];
      
      const existingRecord = await storage.getTodayAttendanceRecord(userId, today);
      if (!existingRecord || existingRecord.checkOutTime) {
        return res.status(400).json({ message: "No active check-in found" });
      }

      const checkOutTime = new Date();
      // Determine expected end time from user profile; fallback 21:00
      const user = await storage.getUser(userId);
      const expectedEnd = (user?.defaultEndTime && typeof user.defaultEndTime === 'string') ? user.defaultEndTime : '21:00';
      const [eh, em] = expectedEnd.split(':').map((v) => parseInt(v, 10));
      const isEarlyLeave = checkOutTime.getHours() < (eh || 21) || (checkOutTime.getHours() === (eh || 21) && checkOutTime.getMinutes() < (em || 0));
      
      // Calculate hours worked
      const hoursWorked = (checkOutTime.getTime() - existingRecord.checkInTime.getTime()) / (1000 * 60 * 60);

      const updatedRecord = await storage.updateAttendanceRecord(existingRecord.id, {
        checkOutTime,
        hoursWorked: hoursWorked.toFixed(2),
        isEarlyLeave,
      });

      // Mark active audio session as stopped and broadcast
      try {
        const active = await storage.getActiveAudioRecordingByAttendance(existingRecord.id);
        if (active) {
          const durationSec = Math.floor((checkOutTime.getTime() - existingRecord.checkInTime.getTime()) / 1000);
          const today = new Date().toISOString().split('T')[0];
          await storage.updateAudioRecording(active.id, {
            isActive: false,
            duration: durationSec,
            recordingDate: today,
          });
          wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({ type: "audio_stop", recordingId: active.id }));
            }
          });
        }
      } catch (err) {
        console.warn('Failed to finalize active audio session on checkout:', err);
      }

      console.log(`✅ Check-out completed - audio will be uploaded automatically`);

      res.json(updatedRecord);
    } catch (error) {
      console.error('Check-out error:', error);
      res.status(500).json({ message: "Failed to check out" });
    }
  });

  app.get("/api/attendance/history", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "employee") {
      return res.status(401).json({ message: "Employee access required" });
    }

    try {
      const records = await storage.getAttendanceRecordsByUserId(req.user.id);
      res.json(records);
    } catch (error) {
      console.error('Attendance history error:', error);
      res.status(500).json({ message: "Failed to fetch attendance history" });
    }
  });

  app.get("/api/attendance/today", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "employee") {
      return res.status(401).json({ message: "Employee access required" });
    }

    try {
      const today = new Date().toISOString().split('T')[0];
      const record = await storage.getTodayAttendanceRecord(req.user.id, today);
      res.json(record);
    } catch (error) {
      console.error('Today attendance error:', error);
      res.status(500).json({ message: "Failed to fetch today's attendance" });
    }
  });

  // Admin routes
  app.get("/api/admin/attendance/today", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "admin") {
      return res.status(401).json({ message: "Admin access required" });
    }

    try {
      const today = new Date().toISOString().split('T')[0];
      const records = await storage.getAllTodayAttendance(today);
      res.json(records);
    } catch (error) {
      console.error('Admin attendance error:', error);
      res.status(500).json({ message: "Failed to fetch attendance data" });
    }
  });

  app.post("/api/admin/attendance/checkin", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "admin") {
      return res.status(401).json({ message: "Admin access required" });
    }

    try {
      const { userId } = req.body;
      const today = new Date().toISOString().split('T')[0];
      const existingRecord = await storage.getTodayAttendanceRecord(userId, today);
      if (existingRecord) {
        return res.status(400).json({ message: "Attendance already recorded for today" });
      }

      const checkInTime = new Date();
      const isLate = checkInTime.getHours() > 9 || (checkInTime.getHours() === 9 && checkInTime.getMinutes() > 15);

      const attendanceRecord = await storage.createAttendanceRecord({
        userId,
        checkInTime,
        date: today,
        isLate,
        isEarlyLeave: false,
      });

      res.status(201).json(attendanceRecord);
    } catch (error) {
      console.error('Admin manual check-in error:', error);
      res.status(500).json({ message: "Failed to check in employee" });
    }
  });

  app.put("/api/admin/attendance/:id", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "admin") {
      return res.status(401).json({ message: "Admin access required" });
    }

    try {
      const { isLate } = req.body;
      const updated = await storage.updateAttendanceRecord(req.params.id, { isLate });
      if (!updated) {
        return res.status(404).json({ message: "Attendance record not found" });
      }
      res.json(updated);
    } catch (error) {
      console.error('Update attendance error:', error);
      res.status(500).json({ message: "Failed to update attendance" });
    }
  });

  app.get("/api/admin/employees", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "admin") {
      return res.status(401).json({ message: "Admin access required" });
    }

    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      console.error('Admin employees error:', error);
      res.status(500).json({ message: "Failed to fetch employees" });
    }
  });

  // Promote/demote a user role (admin only)
  app.post("/api/admin/users/promote", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "admin") {
      return res.status(401).json({ message: "Admin access required" });
    }
    try {
      const { id, username, role } = req.body as { id?: string; username?: string; role?: 'admin' | 'employee' };
      const targetRole: 'admin' | 'employee' = role === 'employee' ? 'employee' : 'admin';
      if (!id && !username) {
        return res.status(400).json({ message: "Provide user id or username" });
      }
      const user = id ? await storage.getUser(id) : await storage.getUserByUsername(String(username));
      if (!user) return res.status(404).json({ message: "User not found" });
      const updated = await storage.updateUser(user.id, { role: targetRole } as any);
      return res.json(updated);
    } catch (error) {
      console.error('Promote user error:', error);
      return res.status(500).json({ message: "Failed to update user role" });
    }
  });

  app.post("/api/admin/employees", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "admin") {
      return res.status(401).json({ message: "Admin access required" });
    }

    try {
      const { username, password, employeeId, department, defaultStartTime, defaultEndTime } = req.body;
      
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }

      const hashedPassword = await hashPassword(password);
      const user = await storage.createUser({
        username,
        password: hashedPassword,
        role: "employee",
        employeeId,
        department,
        defaultStartTime,
        defaultEndTime,
      });

      res.status(201).json(user);
    } catch (error) {
      console.error('Create employee error:', error);
      res.status(500).json({ message: "Failed to create employee" });
    }
  });

  app.put("/api/admin/employees/:id", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "admin") {
      return res.status(401).json({ message: "Admin access required" });
    }

    try {
      const { username, employeeId, department, password, defaultStartTime, defaultEndTime } = req.body;
      const updateData: any = { username, employeeId, department, defaultStartTime, defaultEndTime };
      if (password) {
        updateData.password = await hashPassword(password);
      }
      const user = await storage.updateUser(req.params.id, updateData);
      res.json(user);
    } catch (error) {
      console.error('Update employee error:', error);
      res.status(500).json({ message: "Failed to update employee" });
    }
  });

  app.delete("/api/admin/employees/:id", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "admin") {
      return res.status(401).json({ message: "Admin access required" });
    }

    try {
      await storage.deleteUser(req.params.id);
      res.sendStatus(200);
    } catch (error) {
      console.error('Delete employee error:', error);
      res.status(500).json({ message: "Failed to delete employee" });
    }
  });

  // Monthly work hours report endpoint
  app.get("/api/admin/work-hours", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "admin") {
      return res.status(401).json({ message: "Admin access required" });
    }

    try {
      const { month } = req.query;
      
      if (!month || typeof month !== 'string') {
        return res.status(400).json({ message: "Month parameter is required in YYYY-MM format" });
      }

      // Validate month format (YYYY-MM)
      const monthRegex = /^\d{4}-\d{2}$/;
      if (!monthRegex.test(month)) {
        return res.status(400).json({ message: "Invalid month format. Use YYYY-MM format" });
      }

      // Validate that it's a valid date
      const [year, monthNum] = month.split('-').map(Number);
      if (year < 2000 || year > 2100 || monthNum < 1 || monthNum > 12) {
        return res.status(400).json({ message: "Invalid month. Year must be between 2000-2100 and month between 01-12" });
      }

      const workHoursData = await storage.getMonthlyWorkHours(month);
      res.json(workHoursData);
    } catch (error) {
      console.error('Monthly work hours error:', error);
      res.status(500).json({ message: "Failed to fetch monthly work hours data" });
    }
  });

  // (Removed duplicate audio route with placeholder path)

  // Audio upload route
  app.post(
    "/api/audio/upload",
    async (req, res, next) => {
      if (req.isAuthenticated() && req.user?.role === "employee") return next();
      // Try bearer auth for background uploads
      try {
        const auth = req.headers.authorization || "";
        if (auth.startsWith("Bearer ")) {
          const token = auth.slice(7);
          const secret = process.env.JWT_SECRET || "upload-secret-2025";
          const payload: any = jwt.verify(token, secret);
          if (payload?.sub) {
            const user = await storage.getUser(payload.sub);
            if (user && user.role === "employee") {
              (req as any).user = user;
              return next();
            }
          }
        }
      } catch {}
      return res.status(401).json({ message: "Employee access required" });
    },
    upload.single('audio'),
    async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "employee") {
      return res.status(401).json({ message: "Employee access required" });
    }

    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ message: "No audio file provided" });
      }

      const userId = req.user.id;
      const today = new Date().toISOString().split('T')[0];
      
      console.log(`🎤 Audio uploaded: ${file.filename}, size: ${file.size} bytes`);
      
      const attendanceRecord = await storage.getTodayAttendanceRecord(userId, today);
      
      if (!attendanceRecord) {
        return res.status(400).json({ message: "No attendance record found" });
      }

      const segmentPath = (file as any).path ? path.resolve((file as any).path) : path.join(getAudioBaseDir(), userId, file.filename);
      const uploadDir = path.dirname(segmentPath);
      const masterName = `daily-${today}.m4a`;
      const masterPath = path.join(uploadDir, masterName);

      const resolvedFfmpeg = async (): Promise<string> => {
        if (process.env.FFMPEG_BIN && process.env.FFMPEG_BIN.trim()) return process.env.FFMPEG_BIN;
        try {
          const mod: any = await import('ffmpeg-static');
          if (mod?.default) return mod.default as string;
        } catch {}
        return 'ffmpeg';
      };
      const runFfmpeg = async (args: string[]) => new Promise<void>(async (resolve, reject) => {
        const bin = await resolvedFfmpeg();
        const p = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let stderr = '';
        p.stderr.on('data', (d) => { stderr += d.toString(); });
        p.on('close', (code) => {
          if (code === 0) resolve(); else reject(new Error(stderr || `ffmpeg exited ${code}`));
        });
      });

      const clientDuration = req.body.duration ? parseInt(req.body.duration, 10) : undefined;
      const segDur = clientDuration !== undefined ? clientDuration : 0;

      // Calculate expected timeline length from check-in to now
      const expectedTimelineSec = Math.max(0, Math.floor((Date.now() - new Date(attendanceRecord.checkInTime).getTime()) / 1000));

      let newDurationSec = 0;
      let finalFileSize = 0;
      let finalFileUrl = `/uploads/audio/${userId}/${masterName}`;
      let savedRecording: any = null;

      try {
        const hasMaster = fs.existsSync(masterPath);
        const existing = await storage.getAudioRecordingByUserAndDate(userId, today);
        const existingDuration = existing?.duration ? (typeof existing.duration === 'number' ? existing.duration : parseInt(String(existing.duration), 10) || 0) : 0;
        const gapSec = Math.max(0, expectedTimelineSec - (existingDuration + segDur));

        const tmpOut = path.join(uploadDir, `daily-${today}-${Date.now()}.m4a`);
        const silencePath = path.join(uploadDir, `silence-${Date.now()}.m4a`);

        // Helper to create silence file
        const makeSilence = async (seconds: number) => {
          if (seconds <= 0) return false;
          await runFfmpeg(['-f','lavfi','-t', String(seconds), '-i','anullsrc=channel_layout=mono:sample_rate=48000', '-c:a','aac','-b:a','96k', silencePath]);
          return true;
        };

        if (!hasMaster) {
          if (gapSec > 0) {
            await makeSilence(gapSec);
            await runFfmpeg(['-i', silencePath, '-i', segmentPath, '-filter_complex','[0:a][1:a]concat=n=2:v=0:a=1[a]','-map','[a]','-c:a','aac','-b:a','96k', tmpOut]);
            try { await fs.promises.unlink(silencePath); } catch {}
          } else {
            // Transcode first segment to normalized AAC
            await runFfmpeg(['-i', segmentPath, '-c:a','aac','-b:a','96k', tmpOut]);
          }
        } else {
          // Build concat of master + optional silence + new segment
          if (gapSec > 0) {
            await makeSilence(gapSec);
            await runFfmpeg(['-i', masterPath, '-i', silencePath, '-i', segmentPath, '-filter_complex','[0:a][1:a][2:a]concat=n=3:v=0:a=1[a]','-map','[a]','-c:a','aac','-b:a','96k', tmpOut]);
            try { await fs.promises.unlink(silencePath); } catch {}
          } else {
            await runFfmpeg(['-i', masterPath, '-i', segmentPath, '-filter_complex','[0:a][1:a]concat=n=2:v=0:a=1[a]','-map','[a]','-c:a','aac','-b:a','96k', tmpOut]);
          }
        }

        // Replace master with tmpOut
        await fs.promises.rename(tmpOut, masterPath);
        // Cleanup uploaded raw segment to save space
        try { await fs.promises.unlink(segmentPath); } catch {}

        const stat = fs.statSync(masterPath);
        finalFileSize = stat.size;
        newDurationSec = expectedTimelineSec; // master matches timeline up to now

        // Update or create DB record pointing to master file
        if (existing) {
          savedRecording = await storage.updateAudioRecording(existing.id, {
            attendanceId: attendanceRecord.id,
            fileUrl: finalFileUrl,
            fileName: masterName,
            fileSize: finalFileSize,
            duration: newDurationSec,
            recordingDate: today,
            isActive: false,
          });
        } else {
          savedRecording = await storage.createAudioRecording({
            userId,
            attendanceId: attendanceRecord.id,
            fileUrl: finalFileUrl,
            fileName: masterName,
            fileSize: finalFileSize,
            duration: newDurationSec,
            recordingDate: today,
            isActive: false,
          });
        }
      } catch (mergeErr) {
        console.warn('ffmpeg merge failed, falling back to last file only:', mergeErr);
        // Fallback: keep just the latest file as the day's file
        try {
          await fs.promises.rename(segmentPath, masterPath);
        } catch {
          // if rename fails due to existing, overwrite
          await fs.promises.copyFile(segmentPath, masterPath);
          try { await fs.promises.unlink(segmentPath); } catch {}
        }
        const stat = fs.statSync(masterPath);
        finalFileSize = stat.size;
        newDurationSec = segDur;
        const existing = await storage.getAudioRecordingByUserAndDate(userId, today);
        if (existing) {
          savedRecording = await storage.updateAudioRecording(existing.id, {
            attendanceId: attendanceRecord.id,
            fileUrl: finalFileUrl,
            fileName: masterName,
            fileSize: finalFileSize,
            duration: (typeof existing.duration === 'number' ? existing.duration : parseInt(String(existing.duration || 0), 10) || 0) + segDur,
            recordingDate: today,
            isActive: false,
          });
        } else {
          savedRecording = await storage.createAudioRecording({
            userId,
            attendanceId: attendanceRecord.id,
            fileUrl: finalFileUrl,
            fileName: masterName,
            fileSize: finalFileSize,
            duration: newDurationSec,
            recordingDate: today,
            isActive: false,
          });
        }
      }

      await storage.enforceAudioStorageLimit(30 * 1024 * 1024 * 1024);
      // Also enforce 15-day retention on upload
      await storage.deleteOldAudioRecordings(15);

      console.log(`merge ok: ${masterName} (${finalFileSize} bytes) :: ${savedRecording?.id || ''}`);
      res.json({ message: "Audio uploaded successfully", recording: savedRecording });
    } catch (error) {
      console.error('Audio upload error:', error);
      res.status(500).json({ message: "Failed to upload audio" });
    }
  });

  // Serve audio files (with proper Content-Type and HTTP Range support)
  app.get("/uploads/audio/:userId/:filename", (req, res) => {
    const { userId, filename } = req.params as { userId: string; filename: string };
    const filePath = path.join(getAudioBaseDir(), userId, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: "Audio file not found" });
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Accept-Ranges', 'bytes');

    const ext = path.extname(filePath).toLowerCase();
    const contentType = ext === '.webm' ? 'audio/webm'
      : ext === '.m4a' || ext === '.mp4' ? 'audio/mp4'
      : ext === '.ogg' ? 'audio/ogg'
      : 'audio/*';

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      if (isNaN(start) || isNaN(end) || start > end || end >= fileSize) {
        return res.status(416).set({ 'Content-Range': `bytes */${fileSize}` }).end();
      }
      const chunkSize = end - start + 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
      });
      const stream = fs.createReadStream(filePath, { start, end });
      stream.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': contentType,
      });
      fs.createReadStream(filePath).pipe(res);
    }
  });

  // Quick create employee: minimal input (name + time range + optional password)
  app.post("/api/admin/employees/quick", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "admin") {
      return res.status(401).json({ message: "Admin access required" });
    }

    try {
      const { name, username, time, password } = req.body as { name?: string; username?: string; time?: string; password?: string };
      const uname = (username || name || "").trim();
      if (!uname) return res.status(400).json({ message: "Provide name or username" });

      const toHHMM = (h: number, m: number): string => {
        const hh = String(Math.max(0, Math.min(23, h))).padStart(2, '0');
        const mm = String(Math.max(0, Math.min(59, m))).padStart(2, '0');
        return `${hh}:${mm}`;
      };

      const parseTimeToken = (tok: string, fallbackAm?: boolean): { h: number; m: number } | null => {
        tok = tok.trim().toLowerCase();
        let ampm: 'am' | 'pm' | undefined = undefined;
        if (tok.endsWith('am')) { ampm = 'am'; tok = tok.slice(0, -2); }
        else if (tok.endsWith('pm')) { ampm = 'pm'; tok = tok.slice(0, -2); }
        tok = tok.replace(/[^0-9:]/g, '');
        if (!tok) return null;
        let h = 0, m = 0;
        if (tok.includes(':')) {
          const [hs, ms] = tok.split(':');
          h = parseInt(hs || '0', 10); m = parseInt(ms || '0', 10) || 0;
        } else {
          h = parseInt(tok, 10); m = 0;
        }
        if (isNaN(h) || isNaN(m)) return null;
        if (ampm === 'am') { if (h === 12) h = 0; }
        else if (ampm === 'pm') { if (h < 12) h += 12; }
        else if (fallbackAm === true) { if (h === 12) h = 0; }
        return { h, m };
      };

      const parseTimeRange = (range?: string): { start?: string; end?: string } => {
        if (!range) return {};
        const sep = range.includes(' to ') ? ' to ' : (range.includes('-') ? '-' : (range.includes('–') ? '–' : ' to '));
        const parts = range.split(sep);
        const left = (parts[0] || '').trim();
        const right = (parts[1] || '').trim();
        // infer AM on start if end contains pm
        const endHasPm = /pm\b/i.test(right);
        const t1 = parseTimeToken(left, endHasPm ? true : undefined);
        const t2 = parseTimeToken(right);
        const out: any = {};
        if (t1) out.start = toHHMM(t1.h, t1.m);
        if (t2) out.end = toHHMM(t2.h, t2.m);
        return out;
      };

      const { start, end } = parseTimeRange(time);
      const pwd = (password && String(password)) || '123456';

      const existing = await storage.getUserByUsername(uname);
      if (existing) return res.status(409).json({ message: "Username already exists" });

      const hashed = await hashPassword(pwd);
      const user = await storage.createUser({
        username: uname,
        password: hashed,
        role: 'employee',
        defaultStartTime: start,
        defaultEndTime: end,
      } as any);

      return res.status(201).json(user);
    } catch (error) {
      console.error('Quick create employee error:', error);
      return res.status(500).json({ message: "Failed to create employee" });
    }
  });

  // Bulk update default work hours for employees
  app.patch("/api/admin/employees/schedule", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "admin") {
      return res.status(401).json({ message: "Admin access required" });
    }
    try {
      const { defaultStartTime, defaultEndTime, applyTo } = req.body as { defaultStartTime?: string; defaultEndTime?: string; applyTo?: 'all' | 'unsetOnly' };
      if (!defaultStartTime && !defaultEndTime) {
        return res.status(400).json({ message: "Provide defaultStartTime and/or defaultEndTime" });
      }
      // Fetch employees
      const users = await storage.getAllUsers();
      const updates = users.map(async (u) => {
        const shouldUpdate = applyTo === 'all' || applyTo === undefined || (!u.defaultStartTime && !u.defaultEndTime);
        if (!shouldUpdate) return null;
        const patch: any = {};
        if (defaultStartTime) patch.defaultStartTime = defaultStartTime;
        if (defaultEndTime) patch.defaultEndTime = defaultEndTime;
        if (Object.keys(patch).length === 0) return null;
        return storage.updateUser(u.id, patch);
      });
      await Promise.all(updates);
      res.json({ ok: true });
    } catch (error) {
      console.error('Bulk schedule update error:', error);
      res.status(500).json({ message: "Failed to update schedules" });
    }
  });

  // Audio panel routes (require special access)
  app.get("/api/admin/audio/recordings", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "admin") {
      return res.status(401).json({ message: "Admin access required" });
    }
    try {
      // Enforce 15-day retention before returning list
      await storage.deleteOldAudioRecordings(15);
      const recordings = await storage.getAllAudioRecordings();
      res.json(recordings);
    } catch (error) {
      console.error('Audio recordings error:', error);
      res.status(500).json({ message: "Failed to fetch audio recordings" });
    }
  });

  app.get("/api/admin/audio/active", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "admin") {
      return res.status(401).json({ message: "Admin access required" });
    }
    try {
      const activeRecordings = await storage.getActiveAudioRecordings();
      res.json(activeRecordings);
    } catch (error) {
      console.error('Active recordings error:', error);
      res.status(500).json({ message: "Failed to fetch active recordings" });
    }
  });

  app.post("/api/admin/audio/stop/:id", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "admin") {
      return res.status(401).json({ message: "Admin access required" });
    }
    try {
      const currentRecording = await storage.getAudioRecordingById(req.params.id);

      let duration = 0;
      if (currentRecording?.createdAt) {
        duration = Math.floor((Date.now() - new Date(currentRecording.createdAt).getTime()) / 1000);
      }

      const today = new Date().toISOString().split('T')[0];
      const recording = await storage.updateAudioRecording(req.params.id, {
        isActive: false,
        duration,
        recordingDate: currentRecording?.recordingDate || today,
      });

      // Broadcast stop event so dashboards refresh
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: "audio_stop", recordingId: req.params.id }));
        }
      });

      res.json(recording);
    } catch (error) {
      console.error('Stop recording error:', error);
      res.status(500).json({ message: "Failed to stop recording" });
    }
  });

  app.delete("/api/admin/audio/cleanup", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "admin") {
      return res.status(401).json({ message: "Admin access required" });
    }
    try {
      await storage.deleteOldAudioRecordings(15);
      res.json({ message: "Old recordings older than 15 days cleaned up" });
    } catch (error) {
      console.error('Cleanup error:', error);
      res.status(500).json({ message: "Failed to clean up old recordings" });
    }
  });

  app.delete("/api/admin/audio/:id", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "admin") {
      return res.status(401).json({ message: "Admin access required" });
    }
    try {
      const recording = await storage.getAudioRecordingById(req.params.id);
      if (!recording) {
        return res.status(404).json({ message: "Recording not found" });
      }

      if (recording.fileName) {
        const filePath = path.join(
          __dirname,
          'uploads',
          'audio',
          recording.userId,
          recording.fileName
        );
        try {
          await fs.promises.unlink(filePath);
        } catch (err) {
          console.warn('File delete error:', err);
        }
      }

      await storage.deleteAudioRecording(req.params.id);
      res.json({ message: "Recording deleted" });
    } catch (error) {
      console.error('Delete recording error:', error);
      res.status(500).json({ message: "Failed to delete recording" });
    }
  });

  return;
}

// Helper function to calculate distance between two coordinates
function getDistance_bad(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c;
}


// Clean replacement: Haversine distance in meters
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth's radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dPhi = ((lat2 - lat1) * Math.PI) / 180;
  const dLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dPhi / 2) * Math.sin(dPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) *
    Math.sin(dLambda / 2) * Math.sin(dLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}
