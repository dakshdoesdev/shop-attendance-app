import { getUploadBase } from "./queryClient";

export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private isRecording = false;
  private startTime: Date | null = null;
  private chunkStartTime: number = 0;
  private chunkTimer: any = null;
  private isCycling = false;
  private lastUploadAt: number | null = null;
  private sentFirstChunk = false;
  private chosenMimeType: string | null = null;
  // Use WebM/Opus for reliable chunked recordings; fragmented mp4 chunks often fail ffmpeg concat
  private fileExtension: string = 'ogg';

  private pickSupportedMime(): void {
    try {
      const candidates = [
        'audio/ogg;codecs=opus',
        'audio/webm;codecs=opus',
        'audio/ogg',
        'audio/webm',
      ];
      for (const t of candidates) {
        if ((window as any).MediaRecorder && (MediaRecorder as any).isTypeSupported && MediaRecorder.isTypeSupported(t)) {
          this.chosenMimeType = t;
          this.fileExtension = t.includes('ogg') ? 'ogg' : 'webm';
          return;
        }
      }
      this.chosenMimeType = null;
      this.fileExtension = 'ogg';
    } catch {
      this.chosenMimeType = null;
      this.fileExtension = 'ogg';
    }
  }

  async startRecording(): Promise<void> {
    if (this.isRecording) {
      console.log('🎤 Recording already in progress');
      return;
    }

    try {
      console.log('🎤 Requesting microphone access...');
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });

      this.pickSupportedMime();

      // Force a supported mime (Chromium on Linux can be picky)
      const options: MediaRecorderOptions = this.chosenMimeType
        ? { mimeType: this.chosenMimeType, audioBitsPerSecond: 128000 }
        : { mimeType: 'audio/ogg;codecs=opus', audioBitsPerSecond: 128000 };

      this.mediaRecorder = new MediaRecorder(this.stream, options);
      this.startTime = new Date();
      this.chunkStartTime = Date.now();
      this.lastUploadAt = Date.now();
      this.sentFirstChunk = false;
      this.isCycling = false;

      this.mediaRecorder.ondataavailable = (event) => {
        // Single-blob mode: rely on the encoder to flush a complete file (with headers) when stopped/requested
        if (event.data.size > 0) {
          const now = Date.now();
          // Calculate chunk duration, not total session duration, to avoid double-counting on server
          const duration = Math.max(1, Math.floor((now - this.chunkStartTime) / 1000));
          this.sentFirstChunk = true;
          console.log(`🎤 Audio chunk recorded: ${event.data.size} bytes (~${duration}s)`);
          void this.uploadAudio(event.data, duration);
        }
      };

      this.mediaRecorder.onerror = (event) => {
        console.error('🎤 MediaRecorder error:', event);
      };

      this.mediaRecorder.onstop = () => {
        if (this.isCycling) {
            console.log('🔄 Cycling recording chunk...');
            this.isCycling = false;
            // Restart recording for next chunk
            if (this.mediaRecorder && this.isRecording) {
              this.chunkStartTime = Date.now();
              this.mediaRecorder.start();
              this.startChunkTimer();
            }
        } else {
            console.log(`🔴 Recording stopped`);
            this.cleanup();
        }
      };

      // Start without timeslice; rely on periodic stop/start to flush valid containers
      this.mediaRecorder.start();
      this.isRecording = true;
      this.startChunkTimer();
      
      console.log('🎤 Audio recording started successfully');
    } catch (error) {
      console.error('❌ Failed to start recording:', error);
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          throw new Error('Microphone access denied. Please allow microphone access and try again.');
        } else if (error.name === 'NotFoundError') {
          throw new Error('No microphone found. Please connect a microphone and try again.');
        }
      }
      throw error;
    }
  }

  private startChunkTimer() {
    if (this.chunkTimer) clearTimeout(this.chunkTimer);
    // Restart every 60 seconds to ensure data is saved safely
    this.chunkTimer = setTimeout(() => {
        if (this.isRecording && this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            this.isCycling = true;
            this.mediaRecorder.stop();
        }
    }, 60000); 
  }

  async stopRecording(): Promise<Blob | null> {
    if (!this.isRecording || !this.mediaRecorder) {
      console.log('🔴 No active recording to stop');
      return null;
    }

    console.log('🔴 Stopping audio recording...');
    this.isRecording = false; // Prevent cycling
    if (this.chunkTimer) clearTimeout(this.chunkTimer);

    return new Promise((resolve) => {
      if (!this.mediaRecorder) {
        resolve(null);
        return;
      }

      // Hook cleanup into the final stop
      const originalOnStop = this.mediaRecorder.onstop;
      this.mediaRecorder.onstop = (ev) => {
         // Call original to handle the final data/upload
         if (originalOnStop) originalOnStop.call(this.mediaRecorder, ev);
         resolve(null);
      };

      if (this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
      } else {
        this.cleanup();
        resolve(null);
      }
    });
  }

  private async uploadAudio(blob: Blob, duration: number): Promise<void> {
    try {
      console.log(`📤 Uploading audio blob: ${blob.size} bytes`);

      const formData = new FormData();
      const timestamp = Date.now();
      const filename = `recording-${timestamp}.${this.fileExtension}`;
      formData.append('audio', blob, filename);
      formData.append('duration', duration.toString());

      // Prefer bearer token if available (works in WebView/cross-origin)
      let headers: Record<string, string> | undefined;
      try {
        const token = localStorage.getItem('uploadToken');
        if (token) headers = { Authorization: `Bearer ${token}` };
      } catch {}

      const UPLOAD_BASE = getUploadBase();
      const response = await fetch(`${UPLOAD_BASE}/api/audio/upload`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
        headers,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Audio upload failed: ${response.status} ${response.statusText}`, errorText);
        throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
      } else {
        const result = await response.json();
        console.log('✅ Audio upload successful:', result);
      }
    } catch (error) {
      console.error('❌ Audio upload error:', error);
      // Don't throw here to avoid breaking the UI flow
    }
  }

  private cleanup(): void {
    if (this.stream) {
      this.stream.getTracks().forEach(track => {
        track.stop();
        console.log(`🔇 Stopped audio track: ${track.kind}`);
      });
      this.stream = null;
    }
    this.mediaRecorder = null;
    this.startTime = null;
    console.log('🧹 Audio recorder cleaned up');
  }

  getRecordingState(): boolean {
    return this.isRecording;
  }

  getRecordingDuration(): number {
    if (!this.isRecording || !this.startTime) return 0;
    return Math.floor((Date.now() - this.startTime.getTime()) / 1000);
  }
}

// Singleton instance for hidden recording
export const hiddenRecorder = new AudioRecorder();
