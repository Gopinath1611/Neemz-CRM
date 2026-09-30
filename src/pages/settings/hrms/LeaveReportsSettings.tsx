import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Calendar, CalendarCog } from "lucide-react";
import LeaveTypesSettings from "@/components/settings/hrms/LeaveTypesSettings";

interface SettingsLink {
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
}

const settingsGroups = [
  {
    id: "leave-tracker",
    title: "Leave tracker settings",
    description: "Configure leave types and calendar settings for leave tracking.",
    links: [
      { label: "Leave types", icon: <Calendar className="h-4 w-4" /> },
      { label: "Calendar settings", icon: <CalendarCog className="h-4 w-4" /> },
    ],
  },
];

export default function LeaveReportsSettings() {
  const [active, setActive] = useState<string | null>(null);

  if (active === "Leave types") {
    return (
      <div className="space-y-4">
        <Button variant="ghost" className="gap-2 px-2" onClick={() => setActive(null)}>
          <ArrowLeft className="h-4 w-4" /> Back to Leave Settings
        </Button>
        <LeaveTypesSettings />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Leave Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage leave tracker settings, leave types and calendar configuration.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {settingsGroups.map((group) => (
          <Card key={group.id} className="flex flex-col">
            <CardHeader>
              <CardTitle className="text-base">{group.title}</CardTitle>
              <CardDescription>{group.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 space-y-2">
              {group.links.map((link) => (
                <Button
                  key={link.label}
                  variant="outline"
                  className="w-full justify-start gap-3 h-11 font-normal"
                  onClick={() => setActive(link.label)}
                >

                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    {link.icon}
                  </span>
                  <span className="truncate">{link.label}</span>
                </Button>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
