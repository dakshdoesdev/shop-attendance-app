import { useEffect, useRef, useState } from "react";
import { getApiBase } from "@/lib/queryClient";

// Renders a waveform timeline with optional start/end time labels

interface AudioTimelineProps {
  fileUrl: string;
  startTime?: string | Date;
  duration?: number; // seconds
  audioRef?: React.RefObject<HTMLAudioElement>;
}

export function AudioTimeline({ fileUrl, startTime, duration, audioRef }: AudioTimelineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [segments, setSegments] = useState<number[]>([]);
  const animationRef = useRef<number>();
  const [totalDuration, setTotalDuration] = useState<number>(duration && duration > 0 ? duration : 0);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Analyze the audio file once to generate simple amplitude segments
  useEffect(() => {
    const analyze = async () => {
      try {
        const base = getApiBase();
        const resolved = fileUrl?.startsWith("http") ? fileUrl : `${base || ""}${fileUrl || ""}`;
        const res = await fetch(resolved, { headers: { 'ngrok-skip-browser-warning': 'true' } });
        const arrayBuffer = await res.arrayBuffer();
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        const audioCtx = new AudioCtx();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        const rawData = audioBuffer.getChannelData(0);
        const sampleSize = Math.floor(rawData.length / 100);
        const amplitude: number[] = [];
        for (let i = 0; i < 100; i++) {
          let sum = 0;
          for (let j = 0; j < sampleSize; j++) {
            sum += Math.abs(rawData[i * sampleSize + j]);
          }
          amplitude.push(sum / sampleSize);
        }
        setSegments(amplitude);
      } catch (err) {
        console.error("Audio analysis failed", err);
      }
    };
    analyze();
  }, [fileUrl]);

  // Keep track of the total duration using prop or audio metadata
  useEffect(() => {
    if (duration && duration > 0) {
      setTotalDuration(duration);
    }
  }, [duration]);

  useEffect(() => {
    if (!audioRef?.current) return;
    const audio = audioRef.current;
    const update = () => {
      if (audio.duration && (!duration || duration === 0)) {
        setTotalDuration(audio.duration);
      }
    };
    audio.addEventListener("loadedmetadata", update);
    update();
    return () => {
      audio.removeEventListener("loadedmetadata", update);
    };
  }, [audioRef, duration]);

  // Format seconds into H:MM
  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}:${m.toString().padStart(2, "0")}` : `${m}m`;
  };

  const formatAbsolute = (tSeconds: number) => {
    if (!startTime) return formatTime(tSeconds);
    const base = new Date(startTime);
    const d = new Date(base.getTime() + Math.max(0, tSeconds) * 1000);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  // Determine interval for timeline markers
  const getInterval = (total: number) => {
    if (total > 4 * 3600) return 3600; // 1 hour
    if (total > 3600) return 1800; // 30 minutes
    if (total > 1800) return 600; // 10 minutes
    return 60; // 1 minute
  };

  const getMinorInterval = (major: number) => {
    if (major >= 3600) return 600; // 10 minutes
    if (major >= 1800) return 300; // 5 minutes
    if (major >= 600) return 120; // 2 minutes
    return 30; // 30 seconds
  };

  // Align ticks to absolute boundaries (e.g., on the hour) if startTime is provided
  const getAlignedTicks = (total: number, step: number) => {
    const ticks: number[] = [];
    if (total <= 0 || step <= 0) return ticks;
    if (!startTime) {
      for (let t = step; t < total; t += step) ticks.push(t);
      return ticks;
    }
    const startEpoch = Math.floor(new Date(startTime).getTime() / 1000);
    let k = Math.ceil(startEpoch / step);
    while (true) {
      const tickEpoch = k * step;
      const t = tickEpoch - startEpoch;
      if (t >= total) break;
      if (t > 0) ticks.push(t);
      k++;
    }
    return ticks;
  };

  // Draw waveform, timeline, and playback progress
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || segments.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      // Ensure canvas matches its display size
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      const timelineHeight = 16;
      const waveformHeight = height - timelineHeight;
      ctx.clearRect(0, 0, width, height);

      // Draw waveform bars
      segments.forEach((value, index) => {
        const x = (index / segments.length) * width;
        const barWidth = width / segments.length;
        const barHeight = value * waveformHeight;
        ctx.fillStyle = value > 0.01 ? "#facc15" : "#e5e7eb"; // yellow for voice
        ctx.fillRect(x, waveformHeight - barHeight, barWidth, barHeight);
      });

      const total = totalDuration;

      // Draw timeline markers (major + minor) with absolute clock if startTime present
      if (total > 0) {
        const major = getInterval(total);
        const minor = getMinorInterval(major);
        // minor ticks
        ctx.strokeStyle = "#cbd5e1"; // slate-300
        getAlignedTicks(total, minor).forEach((t) => {
          const x = (t / total) * width;
          ctx.beginPath();
          ctx.moveTo(x, waveformHeight);
          ctx.lineTo(x, waveformHeight + 3);
          ctx.stroke();
        });
        // major ticks + labels
        getAlignedTicks(total, major).forEach((t) => {
          const x = (t / total) * width;
          ctx.strokeStyle = "#94a3b8"; // slate-400
          ctx.beginPath();
          ctx.moveTo(x, waveformHeight);
          ctx.lineTo(x, waveformHeight + 6);
          ctx.stroke();
          const label = formatAbsolute(t);
          ctx.fillStyle = "#475569";
          ctx.font = "10px sans-serif";
          const textWidth = ctx.measureText(label).width;
          ctx.fillText(label, x - textWidth / 2, height - 2);
        });
      }

      // Draw progress indicator
      const audio = audioRef?.current;
      if (audio && total > 0) {
        const progress = audio.currentTime / total;
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        const x = progress * width;
        ctx.fillRect(x, 0, 2, waveformHeight);
        // draw a handle circle
        ctx.beginPath();
        ctx.arc(x, waveformHeight - 2, 3, 0, Math.PI * 2);
        ctx.fillStyle = "#111827"; // slate-900
        ctx.fill();
      }

      // Draw hover indicator and time label
      if (hoverTime !== null && total > 0) {
        const x = (hoverTime / total) * width;
        ctx.strokeStyle = "rgba(0,0,0,0.2)";
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, waveformHeight);
        ctx.stroke();

        const label = formatAbsolute(hoverTime);
        ctx.fillStyle = "#111827";
        ctx.font = "10px sans-serif";
        const textWidth = ctx.measureText(label).width + 6;
        const boxX = Math.min(Math.max(0, x - textWidth / 2), width - textWidth);
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.fillRect(boxX, 2, textWidth, 12);
        ctx.strokeStyle = "rgba(0,0,0,0.2)";
        ctx.strokeRect(boxX, 2, textWidth, 12);
        ctx.fillStyle = "#111827";
        ctx.fillText(label, boxX + 3, 12);
      }

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [segments, audioRef, totalDuration]);

  const startDate = startTime ? new Date(startTime) : null;
  const startLabel = startDate
    ? startDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "0:00";

  const endLabel = (() => {
    if (startDate && totalDuration > 0) {
      const end = new Date(startDate.getTime() + totalDuration * 1000);
      return end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return totalDuration > 0 ? formatTime(totalDuration) : "";
  })();

  const getTimeFromEvent = (clientX: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = Math.min(Math.max(clientX - rect.left, 0), rect.width);
    return (x / rect.width) * totalDuration;
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!audioRef?.current || totalDuration <= 0) return;
    const audio = audioRef.current;
    audio.currentTime = getTimeFromEvent(e.clientX);
    audio.play().catch(() => {});
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (totalDuration <= 0) return;
    const t = getTimeFromEvent(e.clientX);
    setHoverTime(Math.min(Math.max(0, t), totalDuration));
    if (isDragging && audioRef?.current) {
      audioRef.current.currentTime = t;
    }
  };

  const handleMouseLeave = () => {
    if (!isDragging) setHoverTime(null);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (totalDuration <= 0) return;
    setIsDragging(true);
    const t = getTimeFromEvent(e.clientX);
    if (audioRef?.current) audioRef.current.currentTime = t;
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  return (
    <div className="flex items-center gap-2 mt-2">
      <span className="text-xs text-gray-600 w-14 text-left">{startLabel}</span>
      <canvas
        ref={canvasRef}
        width={400}
        height={80}
        className="h-20 flex-1 cursor-pointer"
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
      />
      <span className="text-xs text-gray-600 w-14 text-right">{endLabel}</span>
    </div>
  );
}

export default AudioTimeline;
