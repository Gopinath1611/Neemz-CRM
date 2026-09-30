import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Clock, Plus, CalendarDays, UserCheck, LogIn, LogOut, MapPin, Navigation, Settings2, Loader2 } from "lucide-react";
import { format } from "date-fns";

const Attendance = () => {
  const { user, roles } = useAuth();
  const isAdmin = roles.includes("admin");

  const [employees, setEmployees] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [showMark, setShowMark] = useState(false);
  const [markForm, setMarkForm] = useState({ employee_id: "", check_in: "09:00", check_out: "18:00", status: "present", notes: "" });

  // Self-service state
  const [myEmployee, setMyEmployee] = useState<any>(null);
  const [myTodayLog, setMyTodayLog] = useState<any>(null);
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);

  // Admin quick check-in for any employee
  const [quickEmpId, setQuickEmpId] = useState("");
  const [quickEmpLog, setQuickEmpLog] = useState<any>(null);

  // Geofence settings
  const [showGeofence, setShowGeofence] = useState(false);
  const [geofence, setGeofence] = useState({ lat: "", lng: "", radius: "200" });

  const today = format(new Date(), "yyyy-MM-dd");

  useEffect(() => { fetchEmployees(); }, []);
  useEffect(() => { fetchAttendance(); }, [selectedDate]);
  useEffect(() => { if (user) { findMyEmployee(); fetchGeofence(); } }, [user]);

  const fetchEmployees = async () => {
    const { data } = await supabase.from("employees").select("id, first_name, last_name, employee_code, email").eq("status", "active").order("first_name");
    if (data) setEmployees(data);
  };

  const fetchAttendance = async () => {
    const { data } = await supabase.from("attendance_logs").select("*, employees(first_name, last_name, employee_code)").eq("date", selectedDate).order("created_at", { ascending: false });
    if (data) setAttendance(data);
  };

  const findMyEmployee = async () => {
    if (!user?.email) return;
    const { data } = await supabase.from("employees").select("id, first_name, last_name, employee_code").eq("email", user.email).eq("status", "active").maybeSingle();
    if (data) {
      setMyEmployee(data);
      fetchMyTodayLog(data.id);
    }
  };

  const fetchMyTodayLog = async (empId: string) => {
    const { data } = await supabase.from("attendance_logs").select("*").eq("employee_id", empId).eq("date", today).maybeSingle();
    setMyTodayLog(data);
  };

  const fetchQuickEmpLog = async (empId: string) => {
    if (!empId) { setQuickEmpLog(null); return; }
    const { data } = await supabase.from("attendance_logs").select("*").eq("employee_id", empId).eq("date", today).maybeSingle();
    setQuickEmpLog(data);
  };

  useEffect(() => { if (quickEmpId) fetchQuickEmpLog(quickEmpId); else setQuickEmpLog(null); }, [quickEmpId]);

  const fetchGeofence = async () => {
    const { data } = await supabase.from("clinic_settings").select("geofence_lat, geofence_lng, geofence_radius_meters").limit(1).maybeSingle();
    if (data) {
      setGeofence({
        lat: data.geofence_lat?.toString() || "",
        lng: data.geofence_lng?.toString() || "",
        radius: data.geofence_radius_meters?.toString() || "200",
      });
    }
  };

  const getCurrentLocation = (): Promise<{ lat: number; lng: number }> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) { reject(new Error("Geolocation not supported")); return; }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => reject(err),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  };

  const handleSelfCheckIn = async () => {
    if (!myEmployee) return;
    setCheckingIn(true);
    try {
      const loc = await getCurrentLocation();
      const now = format(new Date(), "HH:mm");
      const { error } = await supabase.from("attendance_logs").upsert({
        employee_id: myEmployee.id,
        date: today,
        check_in: now,
        status: "present",
        check_in_lat: loc.lat,
        check_in_lng: loc.lng,
      }, { onConflict: "employee_id,date" });
      if (error) throw error;
      toast.success(`Checked in at ${now}`);
      fetchMyTodayLog(myEmployee.id);
      if (selectedDate === today) fetchAttendance();
    } catch (e: any) {
      toast.error(e.message || "Failed to check in");
    } finally { setCheckingIn(false); }
  };

  const handleSelfCheckOut = async () => {
    if (!myEmployee || !myTodayLog) return;
    setCheckingOut(true);
    try {
      const loc = await getCurrentLocation();
      const now = format(new Date(), "HH:mm");
      const checkIn = myTodayLog.check_in;
      let hoursWorked = 0;
      if (checkIn) {
        const [h1, m1] = checkIn.split(":").map(Number);
        const [h2, m2] = now.split(":").map(Number);
        hoursWorked = Math.max(0, (h2 + m2 / 60) - (h1 + m1 / 60));
      }
      const { error } = await supabase.from("attendance_logs").update({
        check_out: now,
        check_out_lat: loc.lat,
        check_out_lng: loc.lng,
        hours_worked: Math.round(hoursWorked * 100) / 100,
        overtime_hours: Math.max(0, Math.round((hoursWorked - 8) * 100) / 100),
      }).eq("id", myTodayLog.id);
      if (error) throw error;
      toast.success(`Checked out at ${now}`);
      fetchMyTodayLog(myEmployee.id);
      if (selectedDate === today) fetchAttendance();
    } catch (e: any) {
      toast.error(e.message || "Failed to check out");
    } finally { setCheckingOut(false); }
  };

  // Admin quick check-in/out for selected employee
  const handleQuickCheckIn = async () => {
    if (!quickEmpId) { toast.error("Select an employee"); return; }
    setCheckingIn(true);
    try {
      const now = format(new Date(), "HH:mm");
      const { error } = await supabase.from("attendance_logs").upsert({
        employee_id: quickEmpId, date: today, check_in: now, status: "present",
      }, { onConflict: "employee_id,date" });
      if (error) throw error;
      toast.success(`Checked in at ${now}`);
      fetchQuickEmpLog(quickEmpId);
      if (selectedDate === today) fetchAttendance();
    } catch (e: any) { toast.error(e.message); }
    finally { setCheckingIn(false); }
  };

  const handleQuickCheckOut = async () => {
    if (!quickEmpId || !quickEmpLog) return;
    setCheckingOut(true);
    try {
      const now = format(new Date(), "HH:mm");
      const checkIn = quickEmpLog.check_in;
      let hoursWorked = 0;
      if (checkIn) {
        const [h1, m1] = checkIn.split(":").map(Number);
        const [h2, m2] = now.split(":").map(Number);
        hoursWorked = Math.max(0, (h2 + m2 / 60) - (h1 + m1 / 60));
      }
      const { error } = await supabase.from("attendance_logs").update({
        check_out: now, hours_worked: Math.round(hoursWorked * 100) / 100,
        overtime_hours: Math.max(0, Math.round((hoursWorked - 8) * 100) / 100),
      }).eq("id", quickEmpLog.id);
      if (error) throw error;
      toast.success(`Checked out at ${now}`);
      fetchQuickEmpLog(quickEmpId);
      if (selectedDate === today) fetchAttendance();
    } catch (e: any) { toast.error(e.message); }
    finally { setCheckingOut(false); }
  };

  const handleSaveGeofence = async () => {
    const { data: existing } = await supabase.from("clinic_settings").select("id").limit(1).maybeSingle();
    const payload = {
      geofence_lat: geofence.lat ? parseFloat(geofence.lat) : null,
      geofence_lng: geofence.lng ? parseFloat(geofence.lng) : null,
      geofence_radius_meters: parseInt(geofence.radius) || 200,
    };
    if (existing) {
      await supabase.from("clinic_settings").update(payload).eq("id", existing.id);
    } else {
      await supabase.from("clinic_settings").insert(payload);
    }
    toast.success("Geofence location saved");
    setShowGeofence(false);
  };

  const handleSetCurrentAsGeofence = async () => {
    try {
      const loc = await getCurrentLocation();
      setGeofence({ ...geofence, lat: loc.lat.toFixed(6), lng: loc.lng.toFixed(6) });
      toast.success("Current location captured");
    } catch { toast.error("Could not get location"); }
  };

  const handleMark = async () => {
    if (!markForm.employee_id) { toast.error("Select an employee"); return; }
    const checkIn = markForm.check_in || null;
    const checkOut = markForm.check_out || null;
    let hoursWorked = 0;
    if (checkIn && checkOut) {
      const [h1, m1] = checkIn.split(":").map(Number);
      const [h2, m2] = checkOut.split(":").map(Number);
      hoursWorked = Math.max(0, (h2 + m2 / 60) - (h1 + m1 / 60));
    }
    const { error } = await supabase.from("attendance_logs").upsert({
      employee_id: markForm.employee_id, date: selectedDate, check_in: checkIn, check_out: checkOut,
      status: markForm.status, hours_worked: Math.round(hoursWorked * 100) / 100,
      overtime_hours: Math.max(0, hoursWorked - 8), notes: markForm.notes || null,
    }, { onConflict: "employee_id,date" });
    if (error) { toast.error(error.message); return; }
    toast.success("Attendance marked");
    setShowMark(false);
    setMarkForm({ employee_id: "", check_in: "09:00", check_out: "18:00", status: "present", notes: "" });
    fetchAttendance();
  };

  const handleBulkPresent = async () => {
    const existing = new Set(attendance.map((a) => a.employee_id));
    const unmarked = employees.filter((e) => !existing.has(e.id));
    if (unmarked.length === 0) { toast.info("All employees already marked"); return; }
    const rows = unmarked.map((e) => ({
      employee_id: e.id, date: selectedDate, check_in: "09:00", check_out: "18:00",
      status: "present", hours_worked: 9, overtime_hours: 1,
    }));
    const { error } = await supabase.from("attendance_logs").insert(rows);
    if (error) { toast.error(error.message); return; }
    toast.success(`${unmarked.length} employees marked present`);
    fetchAttendance();
  };

  const presentCount = attendance.filter((a) => a.status === "present").length;
  const absentCount = attendance.filter((a) => a.status === "absent").length;
  const leaveCount = attendance.filter((a) => a.status === "leave" || a.status === "half_day").length;

  const statusColors: Record<string, string> = {
    present: "default", absent: "destructive", leave: "secondary", half_day: "outline", late: "secondary",
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Clock className="h-7 w-7 text-primary" /> Attendance Tracking
          </h1>
          <p className="text-muted-foreground mt-1">Daily attendance logs & time tracking</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {isAdmin && (
            <>
              <Button variant="outline" size="sm" onClick={() => setShowGeofence(true)}>
                <MapPin size={16} className="mr-1" /> Geofence
              </Button>
              <Button variant="outline" size="sm" onClick={handleBulkPresent}>
                <UserCheck size={16} className="mr-1" /> Mark All Present
              </Button>
              <Button size="sm" onClick={() => setShowMark(true)}>
                <Plus size={16} className="mr-1" /> Mark Attendance
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Quick Check In / Check Out Card — always visible */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="pt-5 pb-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground text-lg flex items-center gap-2 mb-2">
                <Clock size={20} className="text-primary" /> Quick Check In / Out
              </p>
              {/* Employee selector for admin, or auto-matched employee */}
              {isAdmin ? (
                <div className="flex items-center gap-3 flex-wrap">
                  <Select value={quickEmpId} onValueChange={(v) => setQuickEmpId(v)}>
                    <SelectTrigger className="w-64"><SelectValue placeholder="Select Employee" /></SelectTrigger>
                    <SelectContent>
                      {employees.map((e) => (
                        <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name} {e.employee_code ? `(${e.employee_code})` : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {quickEmpId && quickEmpLog?.check_in && (
                    <p className="text-sm text-muted-foreground">
                      In: {quickEmpLog.check_in}{quickEmpLog.check_out ? ` • Out: ${quickEmpLog.check_out}` : ""}
                    </p>
                  )}
                </div>
              ) : myEmployee ? (
                <div>
                  <p className="text-sm text-muted-foreground">
                    {myEmployee.first_name} {myEmployee.last_name}
                    {myEmployee.employee_code && ` (${myEmployee.employee_code})`}
                    {myTodayLog?.check_in ? ` — In: ${myTodayLog.check_in}` : ""}
                    {myTodayLog?.check_out ? ` • Out: ${myTodayLog.check_out}` : ""}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Your email is not linked to any employee record</p>
              )}
            </div>
            <div className="flex gap-2">
              {isAdmin ? (
                /* Admin: quick check-in/out for selected employee */
                !quickEmpId ? null :
                !quickEmpLog?.check_in ? (
                  <Button onClick={handleQuickCheckIn} disabled={checkingIn} className="gap-2" size="lg">
                    {checkingIn ? <Loader2 size={18} className="animate-spin" /> : <LogIn size={18} />} Check In
                  </Button>
                ) : !quickEmpLog?.check_out ? (
                  <Button onClick={handleQuickCheckOut} disabled={checkingOut} variant="destructive" className="gap-2" size="lg">
                    {checkingOut ? <Loader2 size={18} className="animate-spin" /> : <LogOut size={18} />} Check Out
                  </Button>
                ) : (
                  <Badge variant="outline" className="border-green-500/50 text-green-600 px-3 py-1.5">✓ Done</Badge>
                )
              ) : myEmployee ? (
                /* Employee self-service */
                !myTodayLog?.check_in ? (
                  <Button onClick={handleSelfCheckIn} disabled={checkingIn} className="gap-2" size="lg">
                    {checkingIn ? <Loader2 size={18} className="animate-spin" /> : <LogIn size={18} />} Check In
                  </Button>
                ) : !myTodayLog?.check_out ? (
                  <Button onClick={handleSelfCheckOut} disabled={checkingOut} variant="destructive" className="gap-2" size="lg">
                    {checkingOut ? <Loader2 size={18} className="animate-spin" /> : <LogOut size={18} />} Check Out
                  </Button>
                ) : (
                  <Badge variant="outline" className="border-green-500/50 text-green-600 px-3 py-1.5">✓ Done</Badge>
                )
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4">
          <p className="text-sm text-muted-foreground">Total Staff</p>
          <p className="text-2xl font-bold text-foreground">{employees.length}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <p className="text-sm text-muted-foreground">Present</p>
          <p className="text-2xl font-bold text-green-600">{presentCount}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <p className="text-sm text-muted-foreground">Absent</p>
          <p className="text-2xl font-bold text-destructive">{absentCount}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <p className="text-sm text-muted-foreground">Leave/Half-day</p>
          <p className="text-2xl font-bold text-amber-600">{leaveCount}</p>
        </CardContent></Card>
      </div>

      {/* Date picker */}
      <div className="flex items-center gap-3">
        <CalendarDays size={18} className="text-muted-foreground" />
        <Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="w-48" />
        <Badge variant="outline">{format(new Date(selectedDate + "T00:00:00"), "EEEE, dd MMM yyyy")}</Badge>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Check In</TableHead>
                <TableHead>Check Out</TableHead>
                <TableHead>Hours</TableHead>
                <TableHead>OT</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Location</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {attendance.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.employees?.first_name} {a.employees?.last_name}</TableCell>
                  <TableCell className="text-sm">{a.employees?.employee_code || "—"}</TableCell>
                  <TableCell>{a.check_in || "—"}</TableCell>
                  <TableCell>{a.check_out || "—"}</TableCell>
                  <TableCell>{a.hours_worked ? `${a.hours_worked}h` : "—"}</TableCell>
                  <TableCell>{a.overtime_hours > 0 ? `${a.overtime_hours}h` : "—"}</TableCell>
                  <TableCell>
                    <Badge variant={statusColors[a.status] as any || "secondary"} className="capitalize">{a.status.replace("_", " ")}</Badge>
                  </TableCell>
                  <TableCell>
                    {a.check_in_lat ? (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Navigation size={12} />
                        {Number(a.check_in_lat).toFixed(4)}, {Number(a.check_in_lng).toFixed(4)}
                      </span>
                    ) : "—"}
                  </TableCell>
                </TableRow>
              ))}
              {attendance.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No attendance records for this date</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Mark Dialog (Admin) */}
      <Dialog open={showMark} onOpenChange={setShowMark}>
        <DialogContent>
          <DialogHeader><DialogTitle>Mark Attendance</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>Employee *</Label>
              <Select value={markForm.employee_id} onValueChange={(v) => setMarkForm({ ...markForm, employee_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name} {e.employee_code ? `(${e.employee_code})` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Check In</Label><Input type="time" value={markForm.check_in} onChange={(e) => setMarkForm({ ...markForm, check_in: e.target.value })} /></div>
              <div><Label>Check Out</Label><Input type="time" value={markForm.check_out} onChange={(e) => setMarkForm({ ...markForm, check_out: e.target.value })} /></div>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={markForm.status} onValueChange={(v) => setMarkForm({ ...markForm, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="present">Present</SelectItem>
                  <SelectItem value="absent">Absent</SelectItem>
                  <SelectItem value="half_day">Half Day</SelectItem>
                  <SelectItem value="leave">Leave</SelectItem>
                  <SelectItem value="late">Late</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Notes</Label><Input value={markForm.notes} onChange={(e) => setMarkForm({ ...markForm, notes: e.target.value })} placeholder="Optional notes" /></div>
            <Button onClick={handleMark} className="w-full">Save Attendance</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Geofence Dialog (Admin) */}
      <Dialog open={showGeofence} onOpenChange={setShowGeofence}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><MapPin size={20} /> Clinic Geofence Location</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">Set the clinic location. Employee check-in location will be compared against this.</p>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Latitude</Label><Input value={geofence.lat} onChange={(e) => setGeofence({ ...geofence, lat: e.target.value })} placeholder="e.g. 11.6643" /></div>
              <div><Label>Longitude</Label><Input value={geofence.lng} onChange={(e) => setGeofence({ ...geofence, lng: e.target.value })} placeholder="e.g. 78.1460" /></div>
            </div>
            <div><Label>Radius (meters)</Label><Input type="number" value={geofence.radius} onChange={(e) => setGeofence({ ...geofence, radius: e.target.value })} /></div>
            <Button variant="outline" onClick={handleSetCurrentAsGeofence} className="w-full gap-2">
              <Navigation size={16} /> Use My Current Location
            </Button>
            <Button onClick={handleSaveGeofence} className="w-full">Save Geofence</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Attendance;
