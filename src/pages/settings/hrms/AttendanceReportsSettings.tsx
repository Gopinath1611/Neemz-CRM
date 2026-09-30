import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowLeftRight, Briefcase, Fingerprint, MapPin, Clock, Users } from "lucide-react";
import ShiftsSettings from "@/components/settings/hrms/ShiftsSettings";
import EmployeeCheckinSettings from "@/components/settings/hrms/EmployeeCheckinSettings";
import GeoFencingSettings from "@/components/settings/hrms/GeoFencingSettings";

interface SettingsLink {
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
}


const settingsGroups = [
  {
    id: "attendance-tracker",
    title: "Attendance tracker settings",
    description: "Configure attendance tracking, shifts, check-in modes and geo-fencing.",
    links: [
      { label: "Shifts", icon: <Clock className="h-4 w-4" /> },
      { label: "Check-in/check-out settings", icon: <ArrowLeftRight className="h-4 w-4" /> },
      { label: "Employee check-in/check-out", icon: <Users className="h-4 w-4" /> },
      { label: "Biometric integration", icon: <Fingerprint className="h-4 w-4" /> },
      { label: "Geo-fencing", icon: <MapPin className="h-4 w-4" /> },
      { label: "Work area", icon: <Briefcase className="h-4 w-4" /> },
    ],
  },
];

export default function AttendanceReportsSettings() {
  const [active, setActive] = useState<string | null>(null);

  if (active === "Shifts" || active === "Employee check-in/check-out" || active === "Geo-fencing") {
    return (
      <div className="space-y-4">
        <Button variant="ghost" className="gap-2 px-2" onClick={() => setActive(null)}>
          <ArrowLeft className="h-4 w-4" /> Back to Attendance Settings
        </Button>
        {active === "Shifts" ? (
          <ShiftsSettings />
        ) : active === "Employee check-in/check-out" ? (
          <EmployeeCheckinSettings />
        ) : (
          <GeoFencingSettings />
        )}
      </div>
    );
  }


  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Attendance Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage attendance tracker settings, shifts, check-in modes and geo-fencing.
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
