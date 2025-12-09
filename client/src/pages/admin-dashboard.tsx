import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { AttendanceRecord, User } from "@shared/schema";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { 
  Users, 
  CheckCircle, 
  Clock, 
  Home, 
  LogOut, 
  Settings, 
  Loader2,
  UserPlus
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const audioPasswordSchema = z.object({
  audioPassword: z.string().min(1, "Audio password is required"),
});

export default function AdminDashboard() {
  const { user, logoutMutation, audioAccessMutation } = useAuth();
  const { toast } = useToast();
  const [audioDialogOpen, setAudioDialogOpen] = useState(false);

  const { data: todayAttendance, isLoading: attendanceLoading } = useQuery<(AttendanceRecord & { user: User })[]>({
    queryKey: ["/api/admin/attendance/today"],
    refetchInterval: 30000,
  });

  const { data: employees } = useQuery<User[]>({
    queryKey: ["/api/admin/employees"],
  });

  const manualCheckIn = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("POST", "/api/admin/attendance/checkin", { userId });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/attendance/today"] });
      toast({ title: "Check-in recorded" });
    },
    onError: (err: Error) => {
      toast({ title: "Check-in failed", description: err.message, variant: "destructive" });
    },
  });

  const updateAttendance = useMutation({
    mutationFn: async ({ id, isLate }: { id: string; isLate: boolean }) => {
      const res = await apiRequest("PUT", `/api/admin/attendance/${id}`, { isLate });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/attendance/today"] });
      toast({ title: "Status updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  const handleStatusChange = (id: string, value: string) => {
    updateAttendance.mutate({ id, isLate: value === "late" });
  };

  const audioForm = useForm<z.infer<typeof audioPasswordSchema>>({
    resolver: zodResolver(audioPasswordSchema),
    defaultValues: {
      audioPassword: "",
    },
  });

  const onAudioSubmit = (data: z.infer<typeof audioPasswordSchema>) => {
    audioAccessMutation.mutate(data, {
      onSuccess: () => {
        setAudioDialogOpen(false);
        window.location.href = "/admin/audio";
      },
    });
  };

  const formatTime = (timestamp: string | Date) => {
    const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStats = () => {
    const total = employees?.length ?? 0;
    const present = todayAttendance?.length ?? 0;
    const late = todayAttendance?.filter(record => record.isLate).length ?? 0;
    const absent = total - present;

    return { total, present, late, absent };
  };

  const stats = getStats();
  const absentEmployees = employees?.filter(
    (e) => !todayAttendance?.some((r) => r.user.id === e.id)
  ) ?? [];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-gray-900" data-testid="text-admin-dashboard">
              Admin Dashboard
            </h1>
            <div className="flex items-center space-x-4">
              <Link href="/admin/employees">
                <Button variant="ghost" data-testid="button-employees">
                  <Users className="mr-2 h-4 w-4" />
                  Employees
                </Button>
              </Link>
              <Link href="/admin/work-hours">
                <Button variant="ghost" data-testid="button-work-hours">
                  <Clock className="mr-2 h-4 w-4" />
                  Work Hours
                </Button>
              </Link>
              <Button
                variant="ghost"
                onClick={() => logoutMutation.mutate()}
                disabled={logoutMutation.isPending}
                data-testid="button-logout"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card data-testid="card-total-employees">
            <CardContent className="p-6">
              <div className="flex items-center">
                <Users className="text-primary text-2xl mr-4" />
                <div>
                  <p className="text-sm text-gray-600">Total Employees</p>
                  <p className="text-2xl font-bold text-gray-900" data-testid="text-total-count">
                    {stats.total}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card data-testid="card-present-today">
            <CardContent className="p-6">
              <div className="flex items-center">
                <CheckCircle className="text-success text-2xl mr-4" />
                <div>
                  <p className="text-sm text-gray-600">Present Today</p>
                  <p className="text-2xl font-bold text-gray-900" data-testid="text-present-count">
                    {stats.present}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card data-testid="card-late-today">
            <CardContent className="p-6">
              <div className="flex items-center">
                <Clock className="text-warning text-2xl mr-4" />
                <div>
                  <p className="text-sm text-gray-600">Late Today</p>
                  <p className="text-2xl font-bold text-gray-900" data-testid="text-late-count">
                    {stats.late}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card data-testid="card-absent-today">
            <CardContent className="p-6">
              <div className="flex items-center">
                <Home className="text-error text-2xl mr-4" />
                <div>
                  <p className="text-sm text-gray-600">Absent Today</p>
                  <p className="text-2xl font-bold text-gray-900" data-testid="text-absent-count">
                    {stats.absent}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Attendance Table */}
        <Card>
          <CardHeader>
            <CardTitle>Today's Attendance</CardTitle>
          </CardHeader>
          <CardContent>
            {attendanceLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Check-in</TableHead>
                      <TableHead>Check-out</TableHead>
                      <TableHead>Hours</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {todayAttendance?.map((record) => (
                      <TableRow key={record.id} data-testid={`row-attendance-${record.id}`}>
                        <TableCell>
                          <div>
                            <div className="font-medium text-gray-900">
                              {record.user.username}
                            </div>
                            <div className="text-sm text-gray-500">
                              {record.user.employeeId}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{formatTime(record.checkInTime)}</TableCell>
                        <TableCell>
                          {record.checkOutTime ? formatTime(record.checkOutTime) : "-"}
                        </TableCell>
                        <TableCell>
                          {record.hoursWorked || "0"}h
                        </TableCell>
                        <TableCell>
                          <Select
                            value={record.isLate ? "late" : "present"}
                            onValueChange={(value) => handleStatusChange(record.id, value)}
                          >
                            <SelectTrigger className="w-[110px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="present">Present</SelectItem>
                              <SelectItem value="late">Late</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell></TableCell>
                      </TableRow>
                    ))}
                    {absentEmployees.map((emp) => (
                      <TableRow key={emp.id} data-testid={`row-absent-${emp.id}`}>
                        <TableCell>
                          <div>
                            <div className="font-medium text-gray-900">{emp.username}</div>
                            <div className="text-sm text-gray-500">{emp.employeeId}</div>
                          </div>
                        </TableCell>
                        <TableCell>-</TableCell>
                        <TableCell>-</TableCell>
                        <TableCell>0h</TableCell>
                        <TableCell>
                          <Badge variant="destructive">Absent</Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            onClick={() => manualCheckIn.mutate(emp.id)}
                            disabled={manualCheckIn.isPending}
                          >
                            Mark Present
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {(!todayAttendance || todayAttendance.length === 0) && absentEmployees.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-gray-500 py-8">
                          No attendance records for today
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Footer with System Maintenance Link */}
        <div className="mt-8 text-center">
          <Dialog open={audioDialogOpen} onOpenChange={setAudioDialogOpen}>
            <DialogTrigger asChild>
              <Button 
                variant="link" 
                className="text-gray-400 hover:text-gray-600 text-sm underline"
                data-testid="button-system-maintenance"
              >
                System Maintenance
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5 text-primary" />
                  Audio Panel Access
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-gray-600">
                  Enter the audio access password to continue:
                </p>
                <Form {...audioForm}>
                  <form onSubmit={audioForm.handleSubmit(onAudioSubmit)} className="space-y-4">
                    <FormField
                      control={audioForm.control}
                      name="audioPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Input 
                              type="password"
                              placeholder="audioAccess2025"
                              {...field}
                              data-testid="input-audio-access-password"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="flex space-x-3">
                      <Button 
                        type="submit" 
                        className="flex-1 bg-primary hover:bg-blue-700"
                        disabled={audioAccessMutation.isPending}
                        data-testid="button-access-panel"
                      >
                        {audioAccessMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Access Panel
                      </Button>
                      <Button 
                        type="button"
                        variant="secondary"
                        className="flex-1"
                        onClick={() => setAudioDialogOpen(false)}
                        data-testid="button-cancel-audio"
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                </Form>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}
