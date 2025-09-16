import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { MonthlyWorkHoursResponse, EmployeeWorkHours, DailyWorkHours } from "@shared/schema";
import { useState, useMemo } from "react";
import { 
  ArrowLeft, 
  Calendar, 
  Clock, 
  Users, 
  Loader2,
  FileText,
  CheckCircle,
  XCircle,
  AlertCircle
} from "lucide-react";

export default function AdminWorkHours() {
  const { user } = useAuth();
  
  // Default to current month (YYYY-MM format)
  const now = new Date();
  const currentMonth = now.toISOString().slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);

  const { data: workHoursData, isLoading, error } = useQuery<MonthlyWorkHoursResponse>({
    queryKey: ["/api/admin/work-hours", selectedMonth],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/work-hours?month=${selectedMonth}`);
      return await res.json();
    },
    enabled: !!selectedMonth,
  });

  // Sorting
  const [sortKey, setSortKey] = useState<'hours' | 'name'>('hours');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const sortedEmployees = useMemo(() => {
    const list = workHoursData?.employees ? [...workHoursData.employees] : [];
    list.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'hours') {
        cmp = (a.totalHours - b.totalHours);
      } else {
        cmp = a.username.localeCompare(b.username);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [workHoursData, sortKey, sortDir]);

  // Generate month options for recent months only (current and last 2)
  const monthOptions = useMemo(() => {
    const options = [];
    const now = new Date();
    const monthsBack = 3; // show current + previous 2 months

    for (let i = 0; i < monthsBack; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthStr = date.toISOString().slice(0, 7);
      const displayName = date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long' 
      });
      options.push({ value: monthStr, label: displayName });
    }
    
    return options;
  }, []);

  const formatTime = (timestamp: string | null) => {
    if (!timestamp) return "-";
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      weekday: 'short',
      day: '2-digit',
      month: 'short'
    });
  };

  const getStatusBadge = (status: DailyWorkHours['status']) => {
    switch (status) {
      case 'complete':
        return (
          <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
            <CheckCircle className="w-3 h-3 mr-1" />
            Complete
          </Badge>
        );
      case 'incomplete':
        return (
          <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">
            <AlertCircle className="w-3 h-3 mr-1" />
            Incomplete
          </Badge>
        );
      case 'absent':
        return (
          <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
            <XCircle className="w-3 h-3 mr-1" />
            Absent
          </Badge>
        );
      default:
        return null;
    }
  };

  const getOverallStats = () => {
    if (!workHoursData?.employees) return { totalEmployees: 0, totalHours: 0, avgHours: 0 };
    
    const totalEmployees = workHoursData.employees.length;
    const totalHours = workHoursData.employees.reduce((sum, emp) => sum + emp.totalHours, 0);
    const avgHours = totalEmployees > 0 ? totalHours / totalEmployees : 0;
    
    return { totalEmployees, totalHours, avgHours: Math.round(avgHours * 100) / 100 };
  };

  const stats = getOverallStats();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center">
              <Link href="/admin">
                <Button variant="ghost" size="sm" className="mr-4">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Monthly Work Hours Report
                </h1>
                <p className="text-sm text-gray-500 mt-1">
                  Comprehensive monthly attendance and work hours tracking
                </p>
              </div>
            </div>
            
            {/* Month + Sort Controls */}
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Calendar className="h-4 w-4 text-gray-500" />
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Select month" />
                  </SelectTrigger>
                  <SelectContent>
                    {monthOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600">Sort:</span>
                <Select value={sortKey} onValueChange={(v: any) => setSortKey(v)}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Sort By" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hours">Total Hours</SelectItem>
                    <SelectItem value="name">Name</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sortDir} onValueChange={(v: any) => setSortDir(v)}>
                  <SelectTrigger className="w-28">
                    <SelectValue placeholder="Order" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="desc">High → Low</SelectItem>
                    <SelectItem value="asc">Low → High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <Users className="text-blue-500 text-2xl mr-4" />
                <div>
                  <p className="text-sm text-gray-600">Total Employees</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {stats.totalEmployees}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <Clock className="text-green-500 text-2xl mr-4" />
                <div>
                  <p className="text-sm text-gray-600">Total Hours</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {stats.totalHours.toFixed(1)}h
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <FileText className="text-purple-500 text-2xl mr-4" />
                <div>
                  <p className="text-sm text-gray-600">Average Hours</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {stats.avgHours}h
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Loading State */}
        {isLoading && (
          <Card>
            <CardContent className="p-8">
              <div className="flex justify-center items-center">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                <span>Loading work hours data...</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Error State */}
        {error && (
          <Card>
            <CardContent className="p-8">
              <div className="text-center text-red-600">
                <XCircle className="h-12 w-12 mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Failed to load data</h3>
                <p className="text-sm">
                  {error instanceof Error ? error.message : "An error occurred while fetching work hours data"}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Employee Work Hours Tables */}
        {workHoursData?.employees && workHoursData.employees.length > 0 && (
          <div className="space-y-8">
            {sortedEmployees.map((employee) => (
              <Card key={employee.userId} className="overflow-hidden">
                <CardHeader className="bg-gray-50 border-b">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg font-semibold text-gray-900">
                        {employee.username}
                      </CardTitle>
                      <div className="flex items-center space-x-4 mt-1 text-sm text-gray-600">
                        <span>ID: {employee.employeeId}</span>
                        <span>•</span>
                        <span>Department: {employee.department}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-blue-600">
                        {employee.totalHours.toFixed(1)}h
                      </div>
                      <div className="text-sm text-gray-500">
                        {employee.totalDays} working days
                      </div>
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50">
                          <TableHead className="font-semibold">Date</TableHead>
                          <TableHead className="font-semibold">Check-in</TableHead>
                          <TableHead className="font-semibold">Check-out</TableHead>
                          <TableHead className="font-semibold">Hours</TableHead>
                          <TableHead className="font-semibold">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {employee.dailyHours.map((day) => (
                          <TableRow 
                            key={day.date}
                            className={`
                              ${day.status === 'absent' ? 'bg-red-50' : ''}
                              ${day.status === 'incomplete' ? 'bg-yellow-50' : ''}
                              ${day.status === 'complete' ? 'bg-green-50' : ''}
                            `}
                          >
                            <TableCell className="font-medium">
                              {formatDate(day.date)}
                            </TableCell>
                            <TableCell>
                              {formatTime(day.checkInTime)}
                            </TableCell>
                            <TableCell>
                              {formatTime(day.checkOutTime)}
                            </TableCell>
                            <TableCell>
                              <span className={`font-medium ${
                                day.hoursWorked > 0 ? 'text-gray-900' : 'text-gray-400'
                              }`}>
                                {day.hoursWorked > 0 ? `${day.hoursWorked.toFixed(1)}h` : '-'}
                              </span>
                            </TableCell>
                            <TableCell>
                              {getStatusBadge(day.status)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  
                  {/* Monthly Summary Footer */}
                  <div className="bg-gray-50 border-t px-6 py-4">
                    <div className="flex justify-between items-center text-sm">
                      <div className="flex space-x-6">
                        <span className="text-gray-600">
                          <span className="font-medium text-green-600">
                            {employee.dailyHours.filter(d => d.status === 'complete').length}
                          </span> complete days
                        </span>
                        <span className="text-gray-600">
                          <span className="font-medium text-yellow-600">
                            {employee.dailyHours.filter(d => d.status === 'incomplete').length}
                          </span> incomplete days
                        </span>
                        <span className="text-gray-600">
                          <span className="font-medium text-red-600">
                            {employee.dailyHours.filter(d => d.status === 'absent').length}
                          </span> absent days
                        </span>
                      </div>
                      <div className="font-semibold text-gray-900">
                        Monthly Total: {employee.totalHours.toFixed(1)} hours
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Empty State */}
        {workHoursData?.employees && workHoursData.employees.length === 0 && (
          <Card>
            <CardContent className="p-8">
              <div className="text-center text-gray-500">
                <FileText className="h-12 w-12 mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No data available</h3>
                <p className="text-sm">
                  No work hours data found for {monthOptions.find(m => m.value === selectedMonth)?.label}
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
