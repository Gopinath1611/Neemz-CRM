import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ToothSVG,
  ToothCondition,
  ToothEntry,
  adultLowerLeft,
  adultLowerRight,
  adultUpperLeft,
  adultUpperRight,
  conditionLabels,
  getToothType,
  isUpperTooth,
  kidsLowerLeft,
  kidsLowerRight,
  kidsUpperLeft,
  kidsUpperRight,
} from "@/components/dental/ToothChart";

interface TimelineDentalChartProps {
  entries: ToothEntry[];
}

const isKnownCondition = (condition: string): condition is ToothCondition => condition in conditionLabels;

export const TimelineDentalChart = ({ entries }: TimelineDentalChartProps) => {
  const isKidsChart = entries.some((entry) => entry.tooth_number >= 51);
  const upperRight = isKidsChart ? kidsUpperRight : adultUpperRight;
  const upperLeft = isKidsChart ? kidsUpperLeft : adultUpperLeft;
  const lowerRight = isKidsChart ? kidsLowerRight : adultLowerRight;
  const lowerLeft = isKidsChart ? kidsLowerLeft : adultLowerLeft;

  const entriesFor = (toothNumber: number) =>
    entries.filter((entry) => entry.tooth_number === toothNumber && entry.condition !== "healthy");

  const renderTooth = (toothNumber: number) => {
    const findings = entriesFor(toothNumber);
    const primary = findings[0];
    const condition = primary?.condition ?? "healthy";
    const upper = isUpperTooth(toothNumber);

    return (
      <Tooltip key={toothNumber}>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={findings.length > 0
              ? `Tooth ${toothNumber}: ${findings.map((finding) => conditionLabels[finding.condition]).join(", ")}`
              : `Tooth ${toothNumber}: No finding`}
            className={cn(
              "group relative flex h-[58px] w-[25px] shrink-0 cursor-default flex-col items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              upper ? "justify-start" : "justify-end",
            )}
          >
            <span className={cn(
              "absolute text-[8px] font-semibold leading-none",
              findings.length > 0 ? "text-foreground" : "text-muted-foreground/70",
              upper ? "top-0" : "bottom-0",
            )}>
              {toothNumber}
            </span>
            <span className={cn("absolute h-[53px] w-[26px]", upper ? "top-[6px]" : "bottom-[6px]")}> 
              <span className="absolute left-1/2 top-0 block origin-top -translate-x-1/2 scale-[0.56] transition-transform group-hover:scale-[0.61] group-focus-visible:scale-[0.61]">
                <ToothSVG
                  number={toothNumber}
                  type={getToothType(toothNumber)}
                  isUpper={upper}
                  condition={condition}
                  hasSurface={primary?.surface}
                />
              </span>
              {findings.length > 1 && (
                <span className="absolute right-0 top-0 flex h-3 min-w-3 items-center justify-center rounded-full bg-warning px-0.5 text-[7px] font-bold leading-none text-warning-foreground">
                  {findings.length}
                </span>
              )}
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent side={upper ? "top" : "bottom"} className="text-xs">
          <p className="font-semibold">Tooth #{toothNumber}</p>
          {findings.length === 0 ? (
            <p className="text-muted-foreground">No finding in this visit</p>
          ) : findings.map((finding, index) => (
            <p key={`${finding.condition}-${finding.surface ?? "none"}-${index}`}>
              {conditionLabels[finding.condition]}{finding.treatment_needed ? ` — ${finding.treatment_needed}` : ""}
            </p>
          ))}
        </TooltipContent>
      </Tooltip>
    );
  };

  const renderRow = (right: number[], left: number[]) => (
    <div className="flex min-w-max items-center justify-center">
      <span className="mr-1 text-[8px] font-bold text-muted-foreground">R</span>
      {right.map(renderTooth)}
      <span className="mx-1 h-[58px] w-px rounded-full bg-primary/25" />
      {left.map(renderTooth)}
      <span className="ml-1 text-[8px] font-bold text-muted-foreground">L</span>
    </div>
  );

  return (
    <TooltipProvider delayDuration={150}>
      <div className="max-w-full overflow-x-auto rounded-md border bg-card px-2 py-2">
        <div className="mx-auto w-max min-w-[470px]">
          <p className="mb-1 text-center text-[9px] font-semibold uppercase text-muted-foreground">Upper Jaw (Maxillary)</p>
          {renderRow(upperRight, upperLeft)}
          <div className="relative my-1 border-t border-dashed border-rose-300/50">
            <span className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 bg-card px-1 text-[7px] text-rose-400">gum line</span>
          </div>
          {renderRow([...lowerRight].reverse(), [...lowerLeft].reverse())}
          <p className="mt-1 text-center text-[9px] font-semibold uppercase text-muted-foreground">Lower Jaw (Mandibular)</p>
        </div>
      </div>
    </TooltipProvider>
  );
};

export const toTimelineToothEntry = (finding: {
  tooth_number: number | null;
  condition: string;
  treatment_needed: string | null;
}): ToothEntry | null => {
  if (!finding.tooth_number || !isKnownCondition(finding.condition)) return null;
  return {
    tooth_number: finding.tooth_number,
    condition: finding.condition,
    treatment_needed: finding.treatment_needed ?? undefined,
  };
};