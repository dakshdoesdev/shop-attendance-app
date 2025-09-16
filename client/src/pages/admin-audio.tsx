import { useEffect, useMemo, useRef, useState, Fragment } from "react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient, getApiBase } from "@/lib/queryClient";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AudioRecording, User } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import AudioTimeline from "@/components/audio-timeline";
import { AlertTriangle, Download, HardDrive, Loader2, Mic, Play, StopCircle, Trash2, X } from "lucide-react";

export default function AdminAudio() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [selectedRecording, setSelectedRecording] = useState<(AudioRecording & { user: User }) | null>(null);
  const [userFilter, setUserFilter] = useState<string>("all");
  const audioRef = useRef<HTMLAudioElement>(null);
  const [audioObjectUrl, setAudioObjectUrl] = useState<string | null>(null);

  const { data: activeRecordings, isLoading: activeLoading } = useQuery<(AudioRecording & { user: User })[]>({
    queryKey: ["/api/admin/audio/active"],
    refetchInterval: 5000,
  });

  const { data: allRecordings, isLoading: recordingsLoading } = useQuery<(AudioRecording & { user: User })[]>({
    queryKey: ["/api/admin/audio/recordings"],
    refetchInterval: 30000,
  });

  const uniqueUsers = useMemo(() => {
    const map = new Map<string, User>();
    allRecordings?.forEach((r) => map.set(r.userId, r.user));
    return Array.from(map.values());
  }, [allRecordings]);

  const [sortBy, setSortBy] = useState<'name' | 'date'>("date");
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>("desc");

  const filteredRecordings = useMemo(() => {
    if (!allRecordings) return [] as (AudioRecording & { user: User })[];
    let records = userFilter === "all" ? [...allRecordings] : allRecordings.filter(r => r.userId === userFilter);
    records.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'name') {
        cmp = a.user.username.localeCompare(b.user.username);
      } else {
        cmp = a.recordingDate.localeCompare(b.recordingDate);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return records;
  }, [allRecordings, userFilter, sortBy, sortDir]);

  const stopRecordingMutation = useMutation({
    mutationFn: async (recordingId: string) => {
      const res = await apiRequest("POST", `/api/admin/audio/stop/${recordingId}`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/audio/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/audio/recordings"] });
      toast({ title: "Recording stopped", description: "Audio recording has been stopped successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to stop recording", description: error.message, variant: "destructive" });
    },
  });

  const cleanupMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", "/api/admin/audio/cleanup");
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/audio/recordings"] });
      toast({ title: "Cleanup completed", description: "Old audio files have been removed" });
    },
    onError: (error: Error) => {
      toast({ title: "Cleanup failed", description: error.message, variant: "destructive" });
    },
  });

  const deleteRecordingMutation = useMutation({
    mutationFn: async (recordingId: string) => {
      const res = await apiRequest("DELETE", `/api/admin/audio/${recordingId}`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/audio/recordings"] });
      toast({ title: "Recording deleted", description: "Audio recording has been removed" });
    },
    onError: (error: Error) => {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    // Derive WS URL from API base when available
    let wsUrl: string;
    try {
      const base = getApiBase();
      if (base) {
        const u = new URL(base);
        const wsProto = u.protocol === "https:" ? "wss:" : "ws:";
        wsUrl = `${wsProto}//${u.host}/ws`;
      } else {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        wsUrl = `${protocol}//${window.location.host}/ws`;
      }
    } catch {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      wsUrl = `${protocol}//${window.location.host}/ws`;
    }

    const websocket = new WebSocket(wsUrl);

    websocket.onopen = () => {
      setWs(websocket);
    };
    websocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "audio_start" || data.type === "audio_stop") {
          queryClient.invalidateQueries({ queryKey: ["/api/admin/audio/active"] });
          queryClient.invalidateQueries({ queryKey: ["/api/admin/audio/recordings"] });
        }
      } catch (_) {
        // no-op
      }
    };
    websocket.onclose = () => setWs(null);
    websocket.onerror = () => {};

    return () => {
      websocket.close();
    };
  }, []);

  useEffect(() => {
    (async () => {
      if (!selectedRecording || !audioRef.current) return;
      audioRef.current.pause();
      // Revoke previous object URL if any
      if (audioObjectUrl) {
        URL.revokeObjectURL(audioObjectUrl);
        setAudioObjectUrl(null);
      }
      const base = getApiBase();
      const href = selectedRecording.fileUrl?.startsWith("http")
        ? selectedRecording.fileUrl
        : `${base || ""}${selectedRecording.fileUrl || ""}`;
      try {
        const res = await fetch(href, { headers: { 'ngrok-skip-browser-warning': 'true' } });
        if (!res.ok) throw new Error(`${res.status}`);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        setAudioObjectUrl(url);
        audioRef.current.src = url;
        audioRef.current.currentTime = 0;
      } catch (e) {
        // fallback to direct URL if fetch fails
        audioRef.current.src = href;
        audioRef.current.currentTime = 0;
      }
    })();
    // Cleanup on unselect
    return () => {
      if (audioObjectUrl) {
        URL.revokeObjectURL(audioObjectUrl);
        setAudioObjectUrl(null);
      }
    };
  }, [selectedRecording]);

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  const formatFileSize = (bytes: number): string => {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return "Unknown";
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? "Unknown" : date.toLocaleDateString();
  };

  const calculateTotalStorage = (): { totalSize: number; totalFiles: number } => {
    if (!allRecordings) return { totalSize: 0, totalFiles: 0 };
    const totalSize = allRecordings.reduce((sum, r) => sum + (r.fileSize || 0), 0);
    return { totalSize, totalFiles: allRecordings.length };
  };

  const { totalSize, totalFiles } = calculateTotalStorage();

  const handleStopRecording = (recordingId: string) => {
    if (confirm("Are you sure you want to stop this recording?")) {
      stopRecordingMutation.mutate(recordingId);
    }
  };

  const handleDownload = async (recording: AudioRecording & { user: User }) => {
    if (!recording.fileUrl) {
      toast({ title: "Download failed", description: "Audio file not available", variant: "destructive" });
      return;
    }
    const base = getApiBase();
    const href = recording.fileUrl?.startsWith("http")
      ? recording.fileUrl
      : `${base || ""}${recording.fileUrl || ""}`;
    try {
      const res = await fetch(href, { headers: { 'ngrok-skip-browser-warning': 'true' } });
      if (!res.ok) throw new Error(`${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = recording.fileName || "audio-recording.webm";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast({ title: "Download started", description: `Downloading ${recording.fileName}` });
    } catch (e: any) {
      toast({ title: "Download failed", description: e?.message || 'Failed to download', variant: 'destructive' });
    }
  };

  const handlePlay = (recording: AudioRecording & { user: User }) => {
    if (!recording.fileUrl) {
      toast({ title: "Playback failed", description: "Audio file not available", variant: "destructive" });
      return;
    }
    if (selectedRecording?.id === recording.id) {
      setSelectedRecording(null);
    } else {
      setSelectedRecording(recording);
    }
  };

  const handleDelete = (recordingId: string) => {
    if (confirm("Are you sure you want to delete this recording? This action cannot be undone.")) {
      deleteRecordingMutation.mutate(recordingId);
    }
  };

  const handleCleanup = () => {
    if (confirm("Are you sure you want to clean up old files? This will permanently delete recordings older than 7 days.")) {
      cleanupMutation.mutate();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-red-50 border-b border-red-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center">
              <Mic className="text-red-600 mr-3 h-6 w-6" />
              <h1 className="text-2xl font-bold text-red-900" data-testid="text-audio-panel-title">
                Audio Monitoring Panel
              </h1>
              <Badge className="ml-4 bg-red-200 text-red-800 hover:bg-red-200">
                <AlertTriangle className="mr-1 h-3 w-3" />
                RESTRICTED ACCESS
              </Badge>
            </div>
            <Link href="/admin">
              <Button variant="ghost" className="text-red-600 hover:text-red-800 hover:bg-red-100" data-testid="button-close-panel">
                <X className="mr-2 h-4 w-4" />
                Close Panel
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
              Active Recording Sessions
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activeLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <div className="space-y-4">
                {activeRecordings?.map((recording) => (
                  <div
                    key={recording.id}
                    className="flex items-center justify-between p-4 bg-red-50 rounded-lg border border-red-200"
                    data-testid={`active-recording-${recording.id}`}
                  >
                    <div className="flex items-center">
                      <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse mr-3" />
                      <div>
                        <p className="font-medium text-gray-900">
                          {recording.user.username} ({recording.user.employeeId})
                        </p>
                        <p className="text-sm text-gray-600">
                          Recording since {new Date(recording.createdAt!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} •
                          Duration: {recording.duration ? formatDuration(recording.duration) : "Calculating..."}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="destructive"
                      onClick={() => handleStopRecording(recording.id)}
                      disabled={stopRecordingMutation.isPending}
                      data-testid={`button-stop-${recording.id}`}
                    >
                      {stopRecordingMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <StopCircle className="mr-2 h-4 w-4" />
                      )}
                      Stop Recording
                    </Button>
                  </div>
                ))}
                {!activeRecordings || activeRecordings.length === 0 ? (
                  <div className="text-center py-8 text-gray-500" data-testid="text-no-active-recordings">
                    No active recording sessions
                  </div>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recording History</CardTitle>
          </CardHeader>
          <CardContent>
            {recordingsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                {uniqueUsers.length > 1 && (
                  <div className="mb-4">
                    <Select value={userFilter} onValueChange={setUserFilter}>
                      <SelectTrigger className="w-56">
                        <SelectValue placeholder="Filter by employee" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Employees</SelectItem>
                        {uniqueUsers.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.username}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="mb-4 flex items-center gap-3">
                  <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Sort by" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="date">Date</SelectItem>
                      <SelectItem value="name">Employee</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}>
                    {sortDir === 'asc' ? 'Asc' : 'Desc'}
                  </Button>
                </div>
                
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>File Size</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRecordings.map((recording) => (
                      <Fragment key={recording.id}>
                        <TableRow data-testid={`row-recording-${recording.id}`}>
                          <TableCell>
                            <div>
                              <div className="font-medium text-gray-900">{recording.user.username}</div>
                              <div className="text-xs text-gray-500">{recording.user.employeeId}</div>
                            </div>
                          </TableCell>
                          <TableCell>{formatDate(recording.recordingDate)}</TableCell>
                          <TableCell>{recording.duration ? formatDuration(recording.duration) : "-"}</TableCell>
                          <TableCell>{recording.fileSize ? formatFileSize(recording.fileSize) : "-"}</TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" onClick={() => handlePlay(recording)} data-testid={`button-play-${recording.id}`}>
                                <Play className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => handleDownload(recording)} data-testid={`button-download-${recording.id}`}>
                                <Download className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="destructive" onClick={() => handleDelete(recording.id)} data-testid={`button-delete-${recording.id}`}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      </Fragment>
                    ))}
                    {filteredRecordings.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-gray-500 py-8">
                          No audio recordings found
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-storage-management">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="h-5 w-5" />
              Storage Management
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900" data-testid="text-total-storage">
                  {formatFileSize(totalSize)}
                </p>
                <p className="text-sm text-gray-600">Total Storage Used</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900" data-testid="text-total-recordings">
                  {totalFiles}
                </p>
                <p className="text-sm text-gray-600">Total Recordings</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900">15 days</p>
                <p className="text-sm text-gray-600">Auto-Delete After</p>
              </div>
            </div>

            <div className="text-center">
              <Button variant="destructive" onClick={handleCleanup} disabled={cleanupMutation.isPending} data-testid="button-cleanup">
                {cleanupMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                Clean Up Old Files
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Inline audio panel under history */}
      {selectedRecording && (
        <div className="max-w-7xl mx-auto px-6 pb-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="truncate">{selectedRecording.fileName || 'Selected Recording'}</span>
                <Button variant="ghost" size="sm" onClick={() => setSelectedRecording(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <audio ref={audioRef} controls className="w-full mb-2" />
              {selectedRecording.fileUrl && (
                <AudioTimeline
                  fileUrl={selectedRecording.fileUrl}
                  audioRef={audioRef}
                  duration={selectedRecording.duration || undefined}
                  startTime={selectedRecording.createdAt || undefined}
                />
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
