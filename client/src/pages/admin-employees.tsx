import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { User } from "@shared/schema";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import TimePicker from "@/components/time-picker";
import { ArrowLeft, UserPlus, Edit, Trash2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest as _api } from "@/lib/queryClient";

function BulkWorkHoursCard() {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [applyAll, setApplyAll] = useState(true);
  const { toast } = useToast();
  const [pending, setPending] = useState(false);

  async function apply() {
    try {
      setPending(true);
      const body: any = { applyTo: applyAll ? 'all' : 'unsetOnly' };
      if (start) body.defaultStartTime = start;
      if (end) body.defaultEndTime = end;
      if (!body.defaultStartTime && !body.defaultEndTime) {
        toast({ title: 'Nothing to apply', description: 'Set start and/or end time' });
        return;
      }
      const res = await _api('PATCH', '/api/admin/employees/schedule', body);
      await res.json();
      toast({ title: 'Updated', description: 'Default work hours applied' });
      // best-effort reload list by reloading page (simple)
      try { (window as any).location?.reload(); } catch {}
    } catch (e: any) {
      toast({ title: 'Failed', description: e?.message || String(e), variant: 'destructive' });
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Default Work Hours</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Company Start Time</label>
            <TimePicker value={start} onChange={setStart} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Company End Time</label>
            <TimePicker value={end} onChange={setEnd} />
          </div>
          <div className="flex items-center gap-2">
            <input id="applyAll" type="checkbox" checked={applyAll} onChange={(e) => setApplyAll(e.target.checked)} />
            <label htmlFor="applyAll" className="text-sm">Apply to all employees (uncheck = only set for employees without custom times)</label>
          </div>
          <Button onClick={apply} disabled={pending || (!start && !end)}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Apply
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function QuickAddEmployee() {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [time, setTime] = useState("8am to 9pm");
  const [password, setPassword] = useState("123456");
  const [pending, setPending] = useState(false);
  function toHHMM(h: number, m: number): string {
    const hh = String(Math.max(0, Math.min(23, h))).padStart(2, '0');
    const mm = String(Math.max(0, Math.min(59, m))).padStart(2, '0');
    return `${hh}:${mm}`;
  }
  function parseTimeToken(tok: string, fallbackAm?: boolean): { h: number; m: number } | null {
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
  }
  function parseTimeRange(range?: string): { start?: string; end?: string } {
    if (!range) return {};
    const normalized = range.replace(/–/g, '-');
    const sep = normalized.includes(' to ') ? ' to ' : (normalized.includes('-') ? '-' : ' to ');
    const parts = normalized.split(sep);
    const left = (parts[0] || '').trim();
    const right = (parts[1] || '').trim();
    const endHasPm = /pm\b/i.test(right);
    const t1 = parseTimeToken(left, endHasPm ? true : undefined);
    const t2 = parseTimeToken(right);
    const out: any = {};
    if (t1) out.start = toHHMM(t1.h, t1.m);
    if (t2) out.end = toHHMM(t2.h, t2.m);
    return out;
  }
  const preview = parseTimeRange(time);

  async function createQuick() {
    try {
      if (!name.trim()) {
        toast({ title: 'Name required', description: 'Enter a username (e.g., xyz)', variant: 'destructive' });
        return;
      }
      setPending(true);
      const res = await _api('POST', '/api/admin/employees/quick', { name: name.trim(), time: time.trim(), password });
      if (!res.ok) throw new Error(`${res.status}`);
      await res.json();
      toast({ title: 'Employee created', description: `${name.trim()} added` });
      try { (window as any).location?.reload(); } catch {}
    } catch (e: any) {
      toast({ title: 'Failed to create', description: e?.message || String(e), variant: 'destructive' });
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Quick Add Employee</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-sm font-medium mb-1">Username</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. xyz" data-testid="quick-username" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Time Range</label>
            <Input value={time} onChange={(e) => setTime(e.target.value)} placeholder="e.g. 7am to 6pm, 7-6, 09:15-18:30" data-testid="quick-time" />
            <div className="text-xs text-gray-500 mt-1">
              {preview.start || preview.end
                ? <>Will set Start: <span className="font-medium">{preview.start || '-'}</span> End: <span className="font-medium">{preview.end || '-'}</span></>
                : <>Could not parse time. You can leave it blank or enter like <span className="font-mono">7am to 6pm</span>.</>}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="default 123456" data-testid="quick-password" />
          </div>
          <div>
            <Button onClick={createQuick} disabled={pending} className="w-full">
              {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const createEmployeeSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  defaultStartTime: z.string().optional(),
  defaultEndTime: z.string().optional(),
});

const editEmployeeSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(6, "Password must be at least 6 characters").optional(),
  defaultStartTime: z.string().optional(),
  defaultEndTime: z.string().optional(),
});

type CreateEmployeeData = z.infer<typeof createEmployeeSchema>;
type EditEmployeeData = z.infer<typeof editEmployeeSchema>;

export default function AdminEmployees() {
  const { user, logoutMutation } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<User | null>(null);

  const { data: employees, isLoading } = useQuery<User[]>({
    queryKey: ["/api/admin/employees"],
  });
  const filtered = (employees || []).filter(e => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const dept = (e as any).department || '';
    return e.username.toLowerCase().includes(q) || String(dept).toLowerCase().includes(q);
  });

  const createEmployeeMutation = useMutation({
    mutationFn: async (data: CreateEmployeeData) => {
      const res = await apiRequest("POST", "/api/admin/employees", data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/employees"] });
      setCreateDialogOpen(false);
      form.reset();
      toast({
        title: "Employee created",
        description: "New employee has been added successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create employee",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteEmployeeMutation = useMutation({
    mutationFn: async (employeeId: string) => {
      await apiRequest("DELETE", `/api/admin/employees/${employeeId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/employees"] });
      toast({
        title: "Employee deleted",
        description: "Employee has been removed successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete employee",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateEmployeeMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: EditEmployeeData }) => {
      const res = await apiRequest("PUT", `/api/admin/employees/${id}`, data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/employees"] });
      setEditDialogOpen(false);
      toast({
        title: "Employee updated",
        description: "Employee details have been updated",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update employee",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const form = useForm<CreateEmployeeData>({
    resolver: zodResolver(createEmployeeSchema),
    defaultValues: {
      username: "",
      password: "123456",
      defaultStartTime: "08:00",
      defaultEndTime: "21:00",
    },
  });

  const editForm = useForm<EditEmployeeData>({
    resolver: zodResolver(editEmployeeSchema),
    defaultValues: {
      username: "",
      password: "",
      defaultStartTime: "",
      defaultEndTime: "",
    },
  });

  const onSubmit = (data: CreateEmployeeData) => {
    createEmployeeMutation.mutate(data);
  };

  const onEditSubmit = (data: EditEmployeeData) => {
    if (!editingEmployee) return;
    updateEmployeeMutation.mutate({ id: editingEmployee.id, data });
  };

  const handleDelete = (employeeId: string) => {
    if (confirm("Are you sure you want to delete this employee?")) {
      deleteEmployeeMutation.mutate(employeeId);
    }
  };

  const handleEdit = (employee: User) => {
    setEditingEmployee(employee);
    editForm.reset({
      username: employee.username,
      password: "",
      // @ts-ignore backend adds these fields
      defaultStartTime: (employee as any).defaultStartTime || "",
      // @ts-ignore
      defaultEndTime: (employee as any).defaultEndTime || "",
    });
    setEditDialogOpen(true);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center">
              <Link href="/admin">
                <Button variant="ghost" size="sm" className="mr-4" data-testid="button-back">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <h1 className="text-2xl font-bold text-gray-900" data-testid="text-employees-title">
                Employee Management
              </h1>
            </div>
              <div className="flex items-center gap-3">
                <input
                  className="border rounded px-3 py-1 text-sm"
                  placeholder="Search username or department"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-primary hover:bg-blue-700" data-testid="button-add-employee">
                  <UserPlus className="mr-2 h-4 w-4" />
                  Add Employee
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Add New Employee</DialogTitle>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="username"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Username</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-new-username" autoComplete="username" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    

                    <FormField
                      control={form.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Password</FormLabel>
                          <FormControl>
                            <Input 
                              type="password"
                              autoComplete="new-password"
                              {...field} 
                              data-testid="input-new-password"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="defaultStartTime"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Start Time (optional)</FormLabel>
                          <FormControl>
                            <TimePicker value={field.value || ""} onChange={field.onChange} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="defaultEndTime"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>End Time (optional)</FormLabel>
                          <FormControl>
                            <TimePicker value={field.value || ""} onChange={field.onChange} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex space-x-3">
                      <Button 
                        type="submit" 
                        className="flex-1 bg-primary hover:bg-blue-700"
                        disabled={createEmployeeMutation.isPending}
                        data-testid="button-create-employee"
                      >
                        {createEmployeeMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Create Employee
                      </Button>
                      <Button 
                        type="button"
                        variant="secondary"
                        className="flex-1"
                        onClick={() => setCreateDialogOpen(false)}
                        data-testid="button-cancel-create"
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
            <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Edit Employee</DialogTitle>
                </DialogHeader>
                <Form {...editForm}>
                  <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
                    <FormField
                      control={editForm.control}
                      name="username"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Username</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-edit-username" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    

                    <FormField
                      control={editForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Password</FormLabel>
                          <FormControl>
                            <Input type="password" autoComplete="new-password" {...field} data-testid="input-edit-password" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={editForm.control}
                      name="defaultStartTime"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Start Time</FormLabel>
                          <FormControl>
                            <TimePicker value={field.value || ""} onChange={field.onChange} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={editForm.control}
                      name="defaultEndTime"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>End Time</FormLabel>
                          <FormControl>
                            <TimePicker value={field.value || ""} onChange={field.onChange} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex space-x-3">
                      <Button
                        type="submit"
                        className="flex-1 bg-primary hover:bg-blue-700"
                        disabled={updateEmployeeMutation.isPending}
                        data-testid="button-update-employee"
                      >
                        {updateEmployeeMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Update Employee
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        className="flex-1"
                        onClick={() => setEditDialogOpen(false)}
                        data-testid="button-cancel-edit"
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <QuickAddEmployee />
        <BulkWorkHoursCard />
        <Card>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Join Date</TableHead>
                      <TableHead>Work Hours</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered?.map((employee) => (
                      <TableRow key={employee.id} data-testid={`row-employee-${employee.id}`}>
                        <TableCell>
                          <div>
                            <div className="font-medium text-gray-900">
                              {employee.username}
                            </div>
                            <div className="text-sm text-gray-500">
                              {employee.employeeId} • {employee.username.toLowerCase()}@bedi.com
                            </div>
                          </div>
                        </TableCell>
                        
                        <TableCell>
                          {employee.joinDate 
                            ? new Date(employee.joinDate).toLocaleDateString()
                            : "N/A"
                          }
                        </TableCell>
                        <TableCell>
                          {(employee as any).defaultStartTime || (employee as any).defaultEndTime ? (
                            <span className="text-gray-800">{(employee as any).defaultStartTime || '-'} 
                              {' '}–{' '} {(employee as any).defaultEndTime || '-'}</span>
                          ) : (
                            <span className="text-gray-400">not set</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant="default"
                            className={employee.isActive ? "bg-success text-white" : "bg-gray-500 text-white"}
                          >
                            {employee.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex space-x-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-primary hover:text-blue-700"
                              onClick={() => handleEdit(employee)}
                              data-testid={`button-edit-${employee.id}`}
                            >
                              <Edit className="h-4 w-4 mr-1" />
                              Edit
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              className="text-error hover:text-red-700"
                              onClick={() => handleDelete(employee.id)}
                              disabled={deleteEmployeeMutation.isPending}
                              data-testid={`button-delete-${employee.id}`}
                            >
                              <Trash2 className="h-4 w-4 mr-1" />
                              Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!employees || employees.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-gray-500 py-8">
                          No employees found
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
