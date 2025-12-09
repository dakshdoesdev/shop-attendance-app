import { useAuth } from "@/hooks/use-auth";
import { Redirect } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoginData, loginSchema } from "@shared/schema";
import { Loader2, Building2 } from "lucide-react";
import { useState } from "react";
import { getCurrentPosition } from "@/lib/geolocation";
import { useToast } from "@/hooks/use-toast";

export default function AuthPage() {
  const { user, isLoading, loginMutation } = useAuth();
  const { toast } = useToast();
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);


  const loginForm = useForm<LoginData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
      location: null,
    },
  });


  // Redirect if already logged in (after hook calls)
  if (user) {
    return <Redirect to={user.role === "admin" ? "/admin" : "/"} />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const onLoginSubmit = async (data: LoginData) => {
    if (loginMutation.isPending || isLocating) return;
    setLocationError(null);

    // Fake location for testing; no browser prompt
    let location = {
      latitude: 0,
      longitude: 0,
      accuracy: 1,
    };

    try {
      await loginMutation.mutateAsync({ ...data, location });
    } catch {}
  };


  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Left side - Form */}
      <div className="flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-2xl font-bold text-center text-gray-900">
                Employee Portal
              </CardTitle>
              <p className="text-center text-gray-600">
                Bedi Enterprises Attendance System
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                  <Form {...loginForm}>
                    <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="space-y-4">
                      <FormField
                        control={loginForm.control}
                        name="username"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Username</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="Enter username" 
                                autoComplete="username"
                                {...field}
                                data-testid="input-username"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={loginForm.control}
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
                                data-testid="input-password"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <Button 
                        type="submit" 
                        className="w-full bg-primary hover:bg-blue-700"
                        disabled={loginMutation.isPending || isLocating}
                        data-testid="button-login"
                      >
                        {(loginMutation.isPending || isLocating) && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Sign In
                      </Button>
                      {locationError && (
                        <p className="text-sm text-red-600" data-testid="location-error">
                          {locationError}
                        </p>
                      )}
                    </form>
                  </Form>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Right side - Hero */}
      <div className="hidden lg:flex flex-1 bg-primary">
        <div className="flex items-center justify-center w-full px-12">
          <div className="text-center text-white">
            <Building2 className="h-16 w-16 mx-auto mb-6" />
            <h2 className="text-3xl font-bold mb-4">Bedi Enterprises</h2>
            <p className="text-xl mb-6">Modern Attendance & Monitoring System</p>
            <ul className="text-left space-y-2 max-w-sm">
              <li className="flex items-center">
                <div className="w-2 h-2 bg-white rounded-full mr-3"></div>
                GPS-based check-in/out
              </li>
              <li className="flex items-center">
                <div className="w-2 h-2 bg-white rounded-full mr-3"></div>
                Real-time attendance tracking
              </li>
              <li className="flex items-center">
                <div className="w-2 h-2 bg-white rounded-full mr-3"></div>
                Admin-managed accounts
              </li>
              <li className="flex items-center">
                <div className="w-2 h-2 bg-white rounded-full mr-3"></div>
                Secure and reliable
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

