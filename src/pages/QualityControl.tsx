import { useState } from "react";
import { useLocation } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShieldCheck } from "lucide-react";
import DoctorQuality from "@/components/quality/DoctorQuality";
import LabQuality from "@/components/quality/LabQuality";
import PharmaQuality from "@/components/quality/PharmaQuality";
import HouseKeepingQuality from "@/components/quality/HouseKeepingQuality";

const QualityControl = () => {
  const location = useLocation();
  const hash = location.hash.replace("#", "") || "doctor";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <ShieldCheck className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground font-display">Quality Control</h1>
          <p className="text-sm text-muted-foreground">Monitor treatment, lab, pharma & house keeping quality across the clinic</p>
        </div>
      </div>

      <Tabs defaultValue={hash} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="doctor">Doctor Treatment</TabsTrigger>
          <TabsTrigger value="lab">Lab Quality</TabsTrigger>
          <TabsTrigger value="pharma">Pharma / Drugs</TabsTrigger>
          <TabsTrigger value="housekeeping">House Keeping Quality</TabsTrigger>
        </TabsList>
        <TabsContent value="doctor"><DoctorQuality /></TabsContent>
        <TabsContent value="lab"><LabQuality /></TabsContent>
        <TabsContent value="pharma"><PharmaQuality /></TabsContent>
        <TabsContent value="housekeeping"><HouseKeepingQuality /></TabsContent>
      </Tabs>
    </div>
  );
};

export default QualityControl;
