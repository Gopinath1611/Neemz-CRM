import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { TimelineDentalChart, toTimelineToothEntry } from "./TimelineDentalChart";
import {
  fetchFindingsTimeline,
  ConsultationFinding,
  FindingHistoryRow,
  STATUS_COLOR,
  STATUS_LABEL,
} from "@/lib/findingsLifecycle";

interface Props {
  patientId: string | null;
  title?: string;
}

/** Chart-sourced finding that has no lifecycle mirror row yet. */
interface ChartFinding {
  id: string;
  tooth_number: number | null;
  condition: string;
  treatment_needed: string | null;
  recorded_at: string;
  doctor: string | null;
}

const norm = (v: string | null | undefined) => (v || "").trim().toLowerCase();
const keyOf = (tooth: number | null, surface: string | null, condition: string) =>
  `${tooth ?? "none"}::${norm(surface)}::${norm(condition)}`;

/**
 * Read findings straight from the dental chart (Doctor Consultation) so the
 * timeline always reflects what was actually marked, even for visits saved
 * before/without a lifecycle mirror row. Read-only: no writes, no status logic.
 */
async function fetchChartFindings(
  patientId: string,
  mirrored: ConsultationFinding[],
): Promise<ChartFinding[]> {
  const [{ data: charts }, { data: appts }] = await Promise.all([
    supabase
      .from("dental_charts")
      .select("id, checkin_id, created_at")
      .eq("patient_id", patientId),
    supabase.from("appointments").select("appointment_date, doctor, status").eq("patient_id", patientId),
  ]);

  const chartRows = (charts as any[]) || [];
  if (chartRows.length === 0) return [];

  const dateDoctor: Record<string, string> = {};
  ((appts as any[]) || []).forEach((a) => {
    if (a.doctor && !dateDoctor[a.appointment_date]) dateDoctor[a.appointment_date] = a.doctor;
  });
  ((appts as any[]) || []).forEach((a) => {
    if (a.doctor && ["completed", "checked_in", "in_progress"].includes(a.status)) {
      dateDoctor[a.appointment_date] = a.doctor;
    }
  });

  const chartDate: Record<string, string> = {};
  chartRows.forEach((c) => { chartDate[c.id] = c.created_at; });

  const { data: entries } = await supabase
    .from("dental_chart_entries")
    .select("id, chart_id, tooth_number, condition, treatment_needed, surface")
    .in("chart_id", chartRows.map((c) => c.id));

  // Keys already represented by the lifecycle mirror — skip those to avoid duplicates.
  const mirroredKeys = new Set(mirrored.map((m) => keyOf(m.tooth_number, m.surface, m.condition)));

  const seen = new Set<string>();
  const out: ChartFinding[] = [];
  ((entries as any[]) || []).forEach((e) => {
    if (!e.condition || norm(e.condition) === "healthy") return;
    const tooth = e.tooth_number && e.tooth_number > 0 ? e.tooth_number : null;
    const key = keyOf(tooth, e.surface || null, e.condition);
    if (mirroredKeys.has(key)) return;
    const recordedAt = chartDate[e.chart_id];
    if (!recordedAt) return;
    const dedupeKey = `${key}::${recordedAt}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    out.push({
      id: `chart:${e.id}`,
      tooth_number: tooth,
      condition: e.condition,
      treatment_needed: e.treatment_needed || null,
      recorded_at: recordedAt,
      doctor: dateDoctor[format(new Date(recordedAt), "yyyy-MM-dd")] || null,
    });
  });

  return out;
}

export const FindingsTimeline = ({ patientId, title = "Findings Timeline" }: Props) => {
  const [findings, setFindings] = useState<ConsultationFinding[]>([]);
  const [history, setHistory] = useState<FindingHistoryRow[]>([]);
  const [chartOnly, setChartOnly] = useState<ChartFinding[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!patientId) {
      setFindings([]);
      setHistory([]);
      setChartOnly([]);
      return;
    }
    setLoading(true);
    fetchFindingsTimeline(patientId)
      .then(async (res) => {
        if (cancelled) return;
        setFindings(res.findings);
        setHistory(res.history);
        const extra = await fetchChartFindings(patientId, res.findings);
        if (cancelled) return;
        setChartOnly(extra);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  const grouped = useMemo(() => {
    const mirrored = findings.map((f) => ({
      id: f.id,
      tooth_number: f.tooth_number,
      condition: f.condition,
      treatment_needed: f.treatment_needed,
      recorded_at: f.recorded_at,
      doctor: f.doctor,
      events: history
        .filter((h) => h.finding_id === f.id)
        .sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime()),
    }));
    const extra = chartOnly.map((c) => ({
      id: c.id,
      tooth_number: c.tooth_number,
      condition: c.condition,
      treatment_needed: c.treatment_needed,
      recorded_at: c.recorded_at,
      doctor: c.doctor,
      events: [] as FindingHistoryRow[],
    }));
    return [...mirrored, ...extra].sort(
      (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
    );
  }, [findings, history, chartOnly]);

  const visitGroups = useMemo(() => {
    const visits = new Map<string, { date: string; doctor: string | null; findings: typeof grouped }>();
    grouped.forEach((finding) => {
      const date = format(new Date(finding.recorded_at), "yyyy-MM-dd");
      const key = `${date}::${finding.doctor ?? ""}`;
      const visit = visits.get(key) ?? { date, doctor: finding.doctor, findings: [] };
      visit.findings.push(finding);
      visits.set(key, visit);
    });
    return Array.from(visits.values()).sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );
  }, [grouped]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity size={16} /> {title}
          <Badge variant="secondary" className="text-[10px]">{grouped.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : grouped.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            No lifecycle events yet. New consultations will be recorded here automatically.
          </p>
        ) : (
          <div className="space-y-4">
            {visitGroups.map((visit) => {
              const chartEntries = visit.findings
                .map(toTimelineToothEntry)
                .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

              return (
                <section key={`${visit.date}-${visit.doctor ?? "unknown"}`} className="overflow-hidden rounded-md border p-3">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">{format(new Date(`${visit.date}T12:00:00`), "dd MMM yyyy")}</span>
                    <Badge variant="secondary" className="text-[10px]">{visit.findings.length} findings</Badge>
                    {visit.doctor && <span className="ml-auto text-xs text-muted-foreground">{visit.doctor}</span>}
                  </div>

                  {chartEntries.length > 0 && <TimelineDentalChart entries={chartEntries} />}

                  <div className="mt-3 space-y-2">
                    {visit.findings.map((finding) => (
                      <div key={finding.id} className="rounded-md bg-muted/30 px-2.5 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className="font-semibold">
                            {finding.tooth_number ? `Tooth #${finding.tooth_number}` : "Full Mouth"}
                          </Badge>
                          <span className="text-xs font-medium">{finding.condition}</span>
                          {finding.treatment_needed && (
                            <span className="text-xs text-muted-foreground">→ {finding.treatment_needed}</span>
                          )}
                        </div>
                        <ol className="ml-1 mt-1.5 space-y-1 border-l pl-3">
                          {finding.events.length === 0 ? (
                            <li className="text-[11px] text-muted-foreground">
                              <span className="font-mono">{format(new Date(finding.recorded_at), "dd MMM yyyy")}</span>{" "}
                              Recorded in dental chart
                            </li>
                          ) : (
                            finding.events.map((event) => (
                              <li key={event.id} className="text-[11px]">
                                <span className="font-mono text-muted-foreground">
                                  {format(new Date(event.event_date), "dd MMM yyyy")}
                                </span>{" "}
                                <Badge variant="outline" className={`${STATUS_COLOR[event.new_status]} ml-1`}>
                                  {STATUS_LABEL[event.new_status]}
                                </Badge>
                                {event.doctor ? <span className="ml-2 text-muted-foreground">· {event.doctor}</span> : null}
                                {event.progress_note ? <div className="mt-0.5 text-muted-foreground">"{event.progress_note}"</div> : null}
                              </li>
                            ))
                          )}
                        </ol>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default FindingsTimeline;
