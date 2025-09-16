import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/use-auth";
import { ProtectedRoute } from "@/lib/protected-route";
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/auth-page";
import EmployeeDashboard from "@/pages/employee-dashboard";
import EmployeeHistory from "@/pages/employee-history";
import EmployeeProfile from "@/pages/employee-profile";
import AdminLogin from "@/pages/admin-login";
import AdminDashboard from "@/pages/admin-dashboard";
import AdminEmployees from "@/pages/admin-employees";
import AdminAudio from "@/pages/admin-audio";
import AdminWorkHours from "@/pages/admin-work-hours";
import Diagnostics from "@/pages/diagnostics";

function Router() {
  return (
    <Switch>
      {/* Employee Routes */}
      <ProtectedRoute path="/" component={EmployeeDashboard} requireRole="employee" />
      <ProtectedRoute path="/history" component={EmployeeHistory} requireRole="employee" />
      <ProtectedRoute path="/profile" component={EmployeeProfile} requireRole="employee" />
      
      {/* Admin Routes */}
      <Route path="/admin-login" component={AdminLogin} />
      <ProtectedRoute path="/admin" component={AdminDashboard} requireRole="admin" />
      <ProtectedRoute path="/admin/employees" component={AdminEmployees} requireRole="admin" />
      <ProtectedRoute path="/admin/work-hours" component={AdminWorkHours} requireRole="admin" />
      <ProtectedRoute path="/admin/audio" component={AdminAudio} requireRole="admin" />

      {/* Diagnostics (unprotected to help before login) */}
      <Route path="/diagnostics" component={Diagnostics} />
      
      {/* Auth Route */}
      <Route path="/auth" component={AuthPage} />
      
      {/* Fallback */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  // No early permission prompts; native start will request as needed

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
