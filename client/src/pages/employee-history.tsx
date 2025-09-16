import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { AttendanceRecord } from "@shared/schema";
import { ArrowLeft, Loader2 } from "lucide-react";

export default function EmployeeHistory() {
  const { user } = useAuth();

  const { data: attendanceHistory, isLoading } = useQuery<AttendanceRecord[]>({
    queryKey: ["/api/attendance/history"],
  });

  const formatDate = (dateString: string | Date) => {
    const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return "Today";
    } else if (date.toDateString() === yesterday.toDateString()) {
      return "Yesterday";
    } else {
      return date.toLocaleDateString();
    }
  };

  const formatTime = (timestamp: string | Date) => {
    const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const calculateWeeklyStats = () => {
    if (!attendanceHistory) return { totalHours: 0, daysPresent: 0 };

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const weeklyRecords = attendanceHistory.filter(record => 
      new Date(record.checkInTime) >= oneWeekAgo
    );

    const totalHours = weeklyRecords.reduce((sum, record) => {
      return sum + (parseFloat(record.hoursWorked || "0"));
    }, 0);

    return {
      totalHours: Math.round(totalHours * 10) / 10,
      daysPresent: weeklyRecords.length,
    };
  };

  const weeklyStats = calculateWeeklyStats();

  const calculateMonthlyStats = () => {
    if (!attendanceHistory) return { totalHours: 0, daysPresent: 0 };
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthlyRecords = attendanceHistory.filter(r => new Date(r.checkInTime) >= startOfMonth);
    const totalHours = monthlyRecords.reduce((sum, r) => sum + (parseFloat(r.hoursWorked || "0")), 0);
    return {
      totalHours: Math.round(totalHours * 10) / 10,
      daysPresent: monthlyRecords.length,
    };
  };
  const monthlyStats = calculateMonthlyStats();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-md mx-auto px-4 py-4 flex items-center">
          <Link href="/">
            <Button variant="ghost" size="sm" className="mr-4" data-testid="button-back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-lg font-semibold text-gray-900" data-testid="text-history-title">
            Attendance History
          </h1>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-6">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <>
            {/* Attendance Records */}
            <div className="space-y-3 mb-6">
              {attendanceHistory?.map((record) => (
                <Card key={record.id} data-testid={`card-attendance-${record.id}`}>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-medium text-gray-900">
                        {formatDate(record.checkInTime)}
                      </span>
                      <Badge 
                        variant={record.isLate ? "destructive" : "default"}
                        className={record.isLate ? "" : "bg-success text-white"}
                        data-testid={`badge-status-${record.id}`}
                      >
                        {record.isLate ? "Late" : record.isEarlyLeave ? "Early Leave" : "On Time"}
                      </Badge>
                    </div>
                    <div className="text-sm text-gray-600 space-y-1">
                      <div data-testid={`text-times-${record.id}`}>
                        Check-in: {formatTime(record.checkInTime)}
                        {record.checkOutTime && (
                          <> • Check-out: {formatTime(record.checkOutTime)}</>
                        )}
                      </div>
                      <div data-testid={`text-hours-${record.id}`}>
                        Hours: {record.hoursWorked || "0"}h
                        {!record.checkOutTime && " (In Progress)"}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {!attendanceHistory || attendanceHistory.length === 0 ? (
                <Card>
                  <CardContent className="p-6 text-center">
                    <p className="text-gray-500" data-testid="text-no-records">
                      No attendance records found
                    </p>
                  </CardContent>
                </Card>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-4">
              {/* Weekly Summary */}
              <Card data-testid="card-weekly-summary">
                <CardHeader>
                  <CardTitle className="text-base">This Week</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-sm space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Total Hours:</span>
                      <span className="font-medium" data-testid="text-total-hours">
                        {weeklyStats.totalHours}h
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Days Present:</span>
                      <span className="font-medium" data-testid="text-days-present">
                        {weeklyStats.daysPresent}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Monthly Summary */}
              <Card data-testid="card-monthly-summary">
                <CardHeader>
                  <CardTitle className="text-base">This Month</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-sm space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Total Hours:</span>
                      <span className="font-medium">
                        {monthlyStats.totalHours}h
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Days Present:</span>
                      <span className="font-medium">
                        {monthlyStats.daysPresent}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
