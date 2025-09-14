import { useAuth } from "@/hooks/use-auth";
import { Redirect } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const adminLoginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

type AdminLoginData = z.infer<typeof adminLoginSchema>;
import { Loader2, Shield } from "lucide-react";

export default function AdminLogin() {
  const { user, isLoading, adminLoginMutation } = useAuth();

  const form = useForm<AdminLoginData>({
    resolver: zodResolver(adminLoginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  // Redirect if already logged in as admin
  if (user?.role === "admin") {
    return <Redirect to="/admin" />;
  }

  // Redirect employees to their dashboard
  if (user?.role === "employee") {
    return <Redirect to="/" />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const onSubmit = (data: AdminLoginData) => {
    adminLoginMutation.mutate(data);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gray-50">
      <div className="max-w-md w-full">
        <Card>
          <CardHeader className="space-y-1 text-center">
            <div className="flex justify-center mb-4">
              <Shield className="h-12 w-12 text-primary" />
            </div>
            <CardTitle className="text-3xl font-bold text-gray-900">
              Admin Portal
            </CardTitle>
            <p className="text-gray-600">
              Bedi Enterprises Management System
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username</FormLabel>
                      <FormControl>
                        <Input 
                          {...field}
                          autoComplete="username"
                          data-testid="input-admin-username"
                          className="px-4 py-3"
                        />
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
                          placeholder="Enter password"
                          autoComplete="current-password"
                          {...field}
                          data-testid="input-admin-password"
                          className="px-4 py-3"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />


                <Button 
                  type="submit" 
                  className="w-full bg-primary hover:bg-blue-700 py-3 font-medium"
                  disabled={adminLoginMutation.isPending}
                  data-testid="button-admin-login"
                >
                  {adminLoginMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Access Admin Panel
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
