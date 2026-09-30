import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import DenominationInput, {
  denomTotal,
  emptyDenoms,
  type DenomMap,
} from "@/components/cashdrawer/DenominationInput";
import { usePermissions } from "@/hooks/usePermissions";

const APPROVER_ROLES = ["admin", "finance_manager", "hr"] as const;

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const inr = (n: number | null | undefined) =>
  `₹${Number(n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const fmtTime = (t: string | null) =>
  t ? new Date(t).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—";

interface DrawerDay {
  id: string;
  drawer_date: string;
  opening_denominations: DenomMap | null;
  opening_total: number;
  opened_by_name: string | null;
  opening_time: string | null;
  closing_denominations: DenomMap | null;
  closing_total: number | null;
  closed_by_name: string | null;
  closing_time: string | null;
  cash_received: number | null;
}

interface DrawerExpense {
  id: string;
  drawer_day_id: string;
  expense_date: string;
  amount: number;
  reason: string;
  approved_by_name: string | null;
  entered_by_name: string | null;
  created_at: string;
}

export default function CashDrawer() {
  const perms = usePermissions("/cash-drawer");
  const { user } = useAuth();
  const { toast } = useToast();

  const [date, setDate] = useState(todayStr());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [day, setDay] = useState<DrawerDay | null>(null);
  const [expenses, setExpenses] = useState<DrawerExpense[]>([]);
  const [cashReceived, setCashReceived] = useState(0);
  const [referralRows, setReferralRows] = useState<
    { id: string; cost: number | null; status: string | null; created_at: string }[]
  >([]);
  const [bankDeposits, setBankDeposits] = useState(0);
  const [depositRows, setDepositRows] = useState<
    { id: string; deposit_no: string | null; deposit_amount: number | null; bank_account: string | null; status: string | null }[]
  >([]);
  const [historyDeposits, setHistoryDeposits] = useState<Record<string, number>>({});
  const [history, setHistory] = useState<DrawerDay[]>([]);
  const [historyExpenses, setHistoryExpenses] = useState<DrawerExpense[]>([]);
  const [approvers, setApprovers] = useState<{ id: string; name: string }[]>([]);
  const [myName, setMyName] = useState("");

  const [openingDenoms, setOpeningDenoms] = useState<DenomMap>(emptyDenoms());
  const [closingDenoms, setClosingDenoms] = useState<DenomMap>(emptyDenoms());

  const [expAmount, setExpAmount] = useState("");
  const [expReason, setExpReason] = useState("");
  const [expDate, setExpDate] = useState(todayStr());
  const [expApprover, setExpApprover] = useState("");

  /* ---------- current user name ---------- */
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
      setMyName(data?.full_name || user.email || "Unknown user");
    })();
  }, [user]);

  /* ---------- approvers ---------- */
  useEffect(() => {
    (async () => {
      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("role", [...APPROVER_ROLES]);
      const ids = Array.from(new Set((roleRows ?? []).map((r) => r.user_id)));
      if (!ids.length) return setApprovers([]);
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      setApprovers(
        (profs ?? [])
          .map((p) => ({ id: p.id, name: p.full_name || "Unnamed" }))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
    })();
  }, []);

  /* ---------- load day ---------- */
  const loadDay = useCallback(async () => {
    setLoading(true);
    const { data: dayRow } = await supabase
      .from("cash_drawer_days")
      .select("*")
      .eq("drawer_date", date)
      .maybeSingle();

    const d = (dayRow as unknown as DrawerDay) ?? null;
    setDay(d);
    setOpeningDenoms((d?.opening_denominations as DenomMap) ?? emptyDenoms());
    setClosingDenoms((d?.closing_denominations as DenomMap) ?? emptyDenoms());

    if (d) {
      const { data: exps } = await supabase
        .from("cash_drawer_expenses")
        .select("*")
        .eq("drawer_day_id", d.id)
        .order("created_at", { ascending: false });
      setExpenses((exps as unknown as DrawerExpense[]) ?? []);
    } else {
      setExpenses([]);
    }

    // cash collected during the day (cash payments only)
    const { data: pays } = await supabase
      .from("billing_payments")
      .select("amount, payment_method, payment_date")
      .gte("payment_date", `${date}T00:00:00`)
      .lte("payment_date", `${date}T23:59:59`);
    setCashReceived(
      (pays ?? [])
        .filter((p) => (p.payment_method || "").toLowerCase().includes("cash"))
        .reduce((s, p) => s + Number(p.amount || 0), 0)
    );

    // referral income for the day (only once report is received / reviewed)
    const { data: refs } = await supabase
      .from("diagnostic_orders")
      .select("id, cost, status, created_at")
      .in("status", ["report_received", "reviewed"])
      .gte("created_at", `${date}T00:00:00`)
      .lte("created_at", `${date}T23:59:59`);
    setReferralRows(refs ?? []);

    // Bank remittances made out of the drawer on this date. These are transfers
    // of cash already counted as income — never treated as revenue again.
    const { data: deps } = await supabase
      .from("deposits")
      .select("id, deposit_no, deposit_amount, bank_account, status, source, drawer_date, deposit_date")
      .eq("source", "cash_drawer")
      .neq("status", "Cancelled");
    const dayDeps = (deps ?? []).filter(
      (d: any) => (d.drawer_date || d.deposit_date) === date
    );
    setDepositRows(dayDeps as any);
    setBankDeposits(dayDeps.reduce((s: number, d: any) => s + Number(d.deposit_amount || 0), 0));

    setLoading(false);
  }, [date]);

  const loadHistory = useCallback(async () => {
    const { data: days } = await supabase
      .from("cash_drawer_days")
      .select("*")
      .order("drawer_date", { ascending: false })
      .limit(60);
    const rows = (days as unknown as DrawerDay[]) ?? [];
    setHistory(rows);
    if (rows.length) {
      const { data: exps } = await supabase
        .from("cash_drawer_expenses")
        .select("*")
        .in(
          "drawer_day_id",
          rows.map((r) => r.id)
        );
      setHistoryExpenses((exps as unknown as DrawerExpense[]) ?? []);
    } else {
      setHistoryExpenses([]);
    }

    const { data: deps } = await supabase
      .from("deposits")
      .select("deposit_amount, status, source, drawer_date, deposit_date")
      .eq("source", "cash_drawer")
      .neq("status", "Cancelled");
    const byDate: Record<string, number> = {};
    (deps ?? []).forEach((d: any) => {
      const key = d.drawer_date || d.deposit_date;
      if (!key) return;
      byDate[key] = (byDate[key] || 0) + Number(d.deposit_amount || 0);
    });
    setHistoryDeposits(byDate);
  }, []);

  useEffect(() => {
    loadDay();
  }, [loadDay]);
  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    setExpDate(date);
  }, [date]);

  /* ---------- derived ---------- */
  const totalExpenses = useMemo(
    () => expenses.reduce((s, e) => s + Number(e.amount || 0), 0),
    [expenses]
  );
  const openingTotal = day ? Number(day.opening_total || 0) : denomTotal(openingDenoms);
  const closingCounted = denomTotal(closingDenoms);
  const expectedCash = openingTotal + cashReceived - totalExpenses;
  // Cash sent to the bank has physically left the drawer, so the counted cash
  // at close must be compared against the net figure — not raw expected cash.
  const netClosingCash = expectedCash - bankDeposits;
  const variance = closingCounted - netClosingCash;

  /* ---------- actions ---------- */
  const saveOpening = async () => {
    if (!user) return;
    const total = denomTotal(openingDenoms);
    if (total <= 0) {
      toast({ title: "Enter at least one denomination", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("cash_drawer_days").insert({
      drawer_date: date,
      opening_denominations: openingDenoms as never,
      opening_total: total,
      opened_by: user.id,
      opened_by_name: myName,
      opening_time: new Date().toISOString(),
    });
    setSaving(false);
    if (error) {
      toast({
        title: "Could not save opening count",
        description: error.message.includes("duplicate")
          ? "An opening entry already exists for this date."
          : error.message,
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Opening cash recorded" });
    loadDay();
    loadHistory();
  };

  const saveClosing = async () => {
    if (!user || !day) return;
    const total = denomTotal(closingDenoms);
    setSaving(true);
    const { error } = await supabase
      .from("cash_drawer_days")
      .update({
        closing_denominations: closingDenoms as never,
        closing_total: total,
        closed_by: user.id,
        closed_by_name: myName,
        closing_time: new Date().toISOString(),
        cash_received: cashReceived,
      })
      .eq("id", day.id);
    setSaving(false);
    if (error) {
      toast({ title: "Could not save closing count", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Closing cash recorded" });
    loadDay();
    loadHistory();
  };

  const addExpense = async () => {
    if (!user) return;
    if (!day) {
      toast({ title: "Record the opening cash count first", variant: "destructive" });
      return;
    }
    const amount = Number(expAmount);
    if (!amount || amount <= 0) {
      toast({ title: "Enter a valid amount", variant: "destructive" });
      return;
    }
    if (!expReason.trim()) {
      toast({ title: "Enter a reason", variant: "destructive" });
      return;
    }
    if (!expApprover) {
      toast({ title: "Select an approver", variant: "destructive" });
      return;
    }
    const approver = approvers.find((a) => a.id === expApprover);
    setSaving(true);
    const { error } = await supabase.from("cash_drawer_expenses").insert({
      drawer_day_id: day.id,
      expense_date: expDate,
      amount,
      reason: expReason.trim(),
      approved_by: expApprover,
      approved_by_name: approver?.name ?? null,
      entered_by: user.id,
      entered_by_name: myName,
    });
    setSaving(false);
    if (error) {
      toast({ title: "Could not save expense", description: error.message, variant: "destructive" });
      return;
    }
    setExpAmount("");
    setExpReason("");
    setExpApprover("");
    toast({ title: "Expense logged" });
    loadDay();
    loadHistory();
  };

  const dayExpenseTotal = (id: string) =>
    historyExpenses.filter((e) => e.drawer_day_id === id).reduce((s, e) => s + Number(e.amount || 0), 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cash Drawer</h1>
          <p className="text-sm text-muted-foreground">
            Opening &amp; closing cash counts, drawer expenses and daily variance.
          </p>
        </div>
        <div className="w-full sm:w-48">
          <Label htmlFor="drawer-date" className="text-xs text-muted-foreground">
            Drawer date
          </Label>
          <Input id="drawer-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Opening cash</CardDescription>
            <CardTitle className="text-xl">{inr(openingTotal)}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            {day?.opened_by_name ? `By ${day.opened_by_name}` : "Not recorded"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Cash received today</CardDescription>
            <CardTitle className="text-xl">{inr(cashReceived)}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">Cash payments only</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Drawer expenses</CardDescription>
            <CardTitle className="text-xl">{inr(totalExpenses)}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            {expenses.length} entr{expenses.length === 1 ? "y" : "ies"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Expected cash</CardDescription>
            <CardTitle className="text-xl">{inr(expectedCash)}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            Opening + received − expenses
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Bank deposits</CardDescription>
            <CardTitle className="text-xl">{inr(bankDeposits)}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            {depositRows.length
              ? `${depositRows.length} remittance${depositRows.length === 1 ? "" : "s"} · transfer, not income`
              : "Nothing remitted from drawer"}
          </CardContent>
        </Card>
        <Card className="border-primary/30">
          <CardHeader className="pb-2">
            <CardDescription>Net closing cash in drawer</CardDescription>
            <CardTitle className="text-xl">{inr(netClosingCash)}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            Expected cash − bank deposits
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Referral income on {date}</CardTitle>
          <CardDescription>
            External referrals with status Report Received or Reviewed ·{" "}
            {inr(referralRows.reduce((s, r) => s + Number(r.cost || 0), 0))}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {referralRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                    No referral income recorded.
                  </TableCell>
                </TableRow>
              ) : (
                referralRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{inr(r.cost)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {r.status === "reviewed" ? "Reviewed" : "Report Received"}
                      </Badge>
                    </TableCell>
                    <TableCell>{fmtTime(r.created_at)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Tabs defaultValue="opening">
        <TabsList className="flex-wrap">
          <TabsTrigger value="opening">Opening count</TabsTrigger>
          <TabsTrigger value="closing">EOD closing</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="summary">Daily summary</TabsTrigger>
        </TabsList>

        {/* OPENING */}
        <TabsContent value="opening" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Opening day cash count</CardTitle>
              <CardDescription>
                {day
                  ? `Recorded by ${day.opened_by_name || "—"} at ${fmtTime(day.opening_time)}`
                  : `Will be recorded as ${myName || "current user"} · one entry per day`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <DenominationInput value={openingDenoms} onChange={setOpeningDenoms} disabled={!!day} />
              {day ? (
                <p className="text-sm text-muted-foreground">
                  Opening count is locked for {date}. Change the drawer date to record another day.
                </p>
              ) : (
                <Button onClick={saveOpening} disabled={saving || loading || !perms.canCreate}>
                  Save opening count
                </Button>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* CLOSING */}
        <TabsContent value="closing" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">End of day closing count</CardTitle>
              <CardDescription>
                {day?.closing_time
                  ? `Closed by ${day.closed_by_name || "—"} at ${fmtTime(day.closing_time)}`
                  : `Will be recorded as ${myName || "current user"}`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!day ? (
                <p className="text-sm text-muted-foreground">
                  Record the opening cash count for {date} first.
                </p>
              ) : (
                <>
                  <DenominationInput value={closingDenoms} onChange={setClosingDenoms} />
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <div className="rounded-md border px-3 py-2">
                      <p className="text-xs text-muted-foreground">Expected cash</p>
                      <p className="text-base font-semibold">{inr(expectedCash)}</p>
                    </div>
                    <div className="rounded-md border px-3 py-2">
                      <p className="text-xs text-muted-foreground">Bank deposits</p>
                      <p className="text-base font-semibold">− {inr(bankDeposits)}</p>
                    </div>
                    <div className="rounded-md border border-primary/30 px-3 py-2">
                      <p className="text-xs text-muted-foreground">Net closing cash</p>
                      <p className="text-base font-semibold">{inr(netClosingCash)}</p>
                    </div>
                    <div className="rounded-md border px-3 py-2">
                      <p className="text-xs text-muted-foreground">Actual counted</p>
                      <p className="text-base font-semibold">{inr(closingCounted)}</p>
                    </div>
                    <div className="rounded-md border px-3 py-2">
                      <p className="text-xs text-muted-foreground">Variance</p>
                      <p
                        className={`text-base font-semibold ${
                          Math.round(variance) !== 0 ? "text-destructive" : ""
                        }`}
                      >
                        {variance > 0 ? "+" : ""}
                        {inr(variance)}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Variance compares the counted cash against net closing cash, so money remitted to the bank on {date} is not shown as a shortage.
                  </p>
                  <Button onClick={saveClosing} disabled={saving || !perms.canEdit}>
                    {day.closing_time ? "Update closing count" : "Save closing count"}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* EXPENSES */}
        <TabsContent value="expenses" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Log an expense from the drawer</CardTitle>
              <CardDescription>Raised by {myName || "current user"}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1">
                  <Label htmlFor="exp-amount">Amount (₹)</Label>
                  <Input
                    id="exp-amount"
                    type="number"
                    min={0}
                    value={expAmount}
                    onChange={(e) => setExpAmount(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="exp-date">Date</Label>
                  <Input
                    id="exp-date"
                    type="date"
                    value={expDate}
                    onChange={(e) => setExpDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Approved by</Label>
                  <Select value={expApprover} onValueChange={setExpApprover}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select approver" />
                    </SelectTrigger>
                    <SelectContent>
                      {approvers.length === 0 ? (
                        <SelectItem value="none" disabled>
                          No approvers available
                        </SelectItem>
                      ) : (
                        approvers.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 sm:col-span-2 lg:col-span-1">
                  <Label htmlFor="exp-reason">Reason</Label>
                  <Textarea
                    id="exp-reason"
                    rows={1}
                    value={expReason}
                    onChange={(e) => setExpReason(e.target.value)}
                    placeholder="Description"
                  />
                </div>
              </div>
              <Button onClick={addExpense} disabled={saving || !perms.canCreate}>
                Add expense
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Expenses on {date}</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Amount</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Approved by</TableHead>
                    <TableHead>Entered by</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                        No expenses logged.
                      </TableCell>
                    </TableRow>
                  ) : (
                    expenses.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="font-medium">{inr(e.amount)}</TableCell>
                        <TableCell>{e.reason}</TableCell>
                        <TableCell>{e.approved_by_name || "—"}</TableCell>
                        <TableCell>{e.entered_by_name || "—"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* SUMMARY */}
        <TabsContent value="summary" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Daily summary</CardTitle>
              <CardDescription>Last 60 recorded days</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Opening</TableHead>
                    <TableHead>Opened by</TableHead>
                    <TableHead>Closing</TableHead>
                    <TableHead>Closed by</TableHead>
                    <TableHead>Expenses</TableHead>
                    <TableHead>Bank deposits</TableHead>
                    <TableHead>Variance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-sm text-muted-foreground">
                        No drawer records yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    history.map((h) => {
                      const exp = dayExpenseTotal(h.id);
                      const dep = Number(historyDeposits[h.drawer_date] || 0);
                      const expected =
                        Number(h.opening_total || 0) + Number(h.cash_received || 0) - exp - dep;
                      const v = h.closing_total == null ? null : Number(h.closing_total) - expected;
                      return (
                        <TableRow key={h.id}>
                          <TableCell className="whitespace-nowrap font-medium">{h.drawer_date}</TableCell>
                          <TableCell>{inr(h.opening_total)}</TableCell>
                          <TableCell>{h.opened_by_name || "—"}</TableCell>
                          <TableCell>{h.closing_total == null ? "—" : inr(h.closing_total)}</TableCell>
                          <TableCell>{h.closed_by_name || "—"}</TableCell>
                          <TableCell>{inr(exp)}</TableCell>
                          <TableCell>{dep ? inr(dep) : "—"}</TableCell>
                          <TableCell>
                            {v == null ? (
                              <Badge variant="outline">Open</Badge>
                            ) : Math.round(v) === 0 ? (
                              <Badge variant="secondary">Balanced</Badge>
                            ) : (
                              <Badge variant="destructive">
                                {v > 0 ? "+" : ""}
                                {inr(v)}
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
