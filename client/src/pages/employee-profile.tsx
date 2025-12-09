import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, User, Loader2 } from "lucide-react";
// Mic test removed per request

export default function EmployeeProfile() {
  const { user, logoutMutation } = useAuth();
  

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  // Mic test handler removed

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
          <h1 className="text-lg font-semibold text-gray-900" data-testid="text-profile-title">
            Profile
          </h1>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-6">
        <Card>
          <CardContent className="p-6">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-gray-300 rounded-full mx-auto mb-3 flex items-center justify-center">
                <User className="h-8 w-8 text-gray-600" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900" data-testid="text-username">
                {user.username}
              </h2>
              {/* Employee ID intentionally hidden from employee view */}
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {/* Microphone Test removed */}
                </label>
                {/*
                <Button 
                  onClick={handleMicTest}
                  className="w-full bg-primary text-white hover:bg-blue-700"
                  disabled={testing}
                  data-testid="button-mic-test"
                >
                  {testing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Testing...
                    </>
                  ) : (
                    <>
                      <Mic className="mr-2 h-4 w-4" />
                      Mic Test (5s)
                    </>
                  )}
                </Button>
                */}
                {/*
                  Grants mic permission and uploads a 5s sample so you can verify in Admin → Recording History.
                */}
              </div>

              {/* Department intentionally hidden from employee view */}
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Shift Time
                </label>
                <p className="text-gray-900" data-testid="text-shift-time">
                  9:00 AM - 9:30 PM
                </p>
              </div>
              
              {user.joinDate && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Join Date
                  </label>
                  <p className="text-gray-900" data-testid="text-join-date">
                    {new Date(user.joinDate).toLocaleDateString()}
                  </p>
                </div>
              )}

              <Button 
                onClick={handleLogout}
                className="w-full bg-gray-600 text-white hover:bg-gray-700 mt-6"
                disabled={logoutMutation.isPending}
                data-testid="button-logout"
              >
                {logoutMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Logout
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
