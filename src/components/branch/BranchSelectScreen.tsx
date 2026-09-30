import { useBranch } from "@/contexts/BranchContext";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2, LogOut, Loader2 } from "lucide-react";

const BranchSelectScreen = () => {
  const { branches, setCurrentBranch, loading } = useBranch();
  const { signOut, roles } = useAuth();
  const isAdmin = roles.includes("admin");

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center space-y-3">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl gradient-primary">
            <Building2 className="h-7 w-7 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl font-display">Select Branch</CardTitle>
          <CardDescription>
            {isAdmin
              ? "Choose which branch you want to manage"
              : "Choose your branch to continue"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {branches.length === 0 ? (
            <div className="text-center py-8 space-y-3">
              <p className="text-sm text-muted-foreground">
                No branches available for your account.
              </p>
              <p className="text-xs text-muted-foreground">
                Please contact an admin to assign you to a branch.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {branches.map((b) => (
                <button
                  key={b.id}
                  onClick={() => setCurrentBranch(b.id)}
                  className="group flex flex-col items-start gap-2 rounded-lg border border-border bg-card p-4 text-left transition hover:border-primary hover:shadow-md"
                >
                  <div className="flex items-center gap-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-semibold">{b.name}</div>
                      <div className="text-xs text-muted-foreground">{b.code}</div>
                    </div>
                  </div>
                  {b.address && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{b.address}</p>
                  )}
                </button>
              ))}
            </div>
          )}
          <Button
            variant="ghost"
            className="w-full text-muted-foreground"
            onClick={signOut}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default BranchSelectScreen;
