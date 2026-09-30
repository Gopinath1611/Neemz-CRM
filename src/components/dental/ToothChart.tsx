import { useMemo, useState } from "react";
import { useClinicMasters } from "@/hooks/useClinicMasters";
import { ArrowRight, X, Trash2, Undo2 } from "lucide-react";
import upperMolarImg from "@/assets/teeth/upper-molar.png";
import upperPremolarImg from "@/assets/teeth/upper-premolar.png";
import upperCanineImg from "@/assets/teeth/upper-canine.png";
import upperIncisorImg from "@/assets/teeth/upper-incisor.png";
import lowerMolarImg from "@/assets/teeth/lower-molar.png";
import lowerPremolarImg from "@/assets/teeth/lower-premolar.png";
import lowerCanineImg from "@/assets/teeth/lower-canine.png";
import lowerIncisorImg from "@/assets/teeth/lower-incisor.png";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CheckSquare, Square } from "lucide-react";

export type ToothCondition = "healthy" | "cavity" | "grossly_decayed" | "missing" | "crown" | "rct" | "filling" | "implant" | "bridge" | "fracture" | "mobility" | "impacted" | "ortho" | "scaling" | "consultation" | "cd" | "full_mouth_implant" | "cervical_abrasion" | "attrition";

export type MobilityGrade = "grade_1" | "grade_2" | "grade_3";

export interface ToothEntry {
  tooth_number: number;
  condition: ToothCondition;
  treatment_needed?: string;
  notes?: string;
  surface?: string;
  mobility_grade?: MobilityGrade;
}

interface ToothChartProps {
  entries: ToothEntry[];
  onToothClick: (toothNumber: number) => void;
  onSaveEntry: (entry: ToothEntry) => void;
  generalFindings?: Array<{ condition: ToothCondition; treatment_needed?: string }>;
  onGeneralFindingsChange?: (findings: Array<{ condition: ToothCondition; treatment_needed?: string }>) => void;
  chartType?: "adult" | "child";
  onChartModeChange?: (mode: "adult" | "kids") => void;
  onProceedToTreatment?: (group: { condition: string; treatment_needed?: string; teeth: number[] }) => void;
  onUndoProceed?: (group: { condition: string; treatment_needed?: string; teeth: number[] }) => void;
  onDeleteFinding?: (group: { condition: string; treatment_needed?: string; teeth: number[] }) => void;
  proceededTeeth?: Set<number>;
  proceededGeneralConditions?: Set<string>;
  readOnly?: boolean;
}

export const conditionColors: Record<ToothCondition, { fill: string; stroke: string; badge: string; icon: string; fillGrad?: string }> = {
  healthy: { fill: "#f0f7f0", stroke: "#a8d5a8", badge: "bg-emerald-100 border-emerald-400 text-emerald-700", icon: "✓", fillGrad: "#e8f5e8" },
  cavity: { fill: "#fecaca", stroke: "#ef4444", badge: "bg-red-100 border-red-400 text-red-700", icon: "●", fillGrad: "#fca5a5" },
  grossly_decayed: { fill: "#fee2e2", stroke: "#b91c1c", badge: "bg-red-200 border-red-500 text-red-800", icon: "◉", fillGrad: "#fca5a5" },
  missing: { fill: "#e5e7eb", stroke: "#9ca3af", badge: "bg-gray-200 border-gray-400 text-gray-500", icon: "✕" },
  crown: { fill: "#fef3c7", stroke: "#f59e0b", badge: "bg-amber-100 border-amber-400 text-amber-700", icon: "♛", fillGrad: "#fde68a" },
  rct: { fill: "#ede9fe", stroke: "#8b5cf6", badge: "bg-purple-100 border-purple-400 text-purple-700", icon: "⊕", fillGrad: "#ddd6fe" },
  filling: { fill: "#dbeafe", stroke: "#3b82f6", badge: "bg-blue-100 border-blue-400 text-blue-700", icon: "■", fillGrad: "#bfdbfe" },
  implant: { fill: "#cffafe", stroke: "#06b6d4", badge: "bg-cyan-100 border-cyan-400 text-cyan-700", icon: "⬡", fillGrad: "#a5f3fc" },
  bridge: { fill: "#ffedd5", stroke: "#f97316", badge: "bg-orange-100 border-orange-400 text-orange-700", icon: "⌇", fillGrad: "#fed7aa" },
  fracture: { fill: "#ffe4e6", stroke: "#f43f5e", badge: "bg-rose-100 border-rose-400 text-rose-700", icon: "⚡", fillGrad: "#fecdd3" },
  mobility: { fill: "#fef9c3", stroke: "#eab308", badge: "bg-yellow-100 border-yellow-400 text-yellow-700", icon: "↔", fillGrad: "#fef08a" },
  impacted: { fill: "#e0e7ff", stroke: "#6366f1", badge: "bg-indigo-100 border-indigo-400 text-indigo-700", icon: "▼", fillGrad: "#c7d2fe" },
  ortho: { fill: "#f0fdf4", stroke: "#22c55e", badge: "bg-green-100 border-green-400 text-green-700", icon: "⊞", fillGrad: "#dcfce7" },
  scaling: { fill: "#e0f2fe", stroke: "#0284c7", badge: "bg-sky-100 border-sky-400 text-sky-700", icon: "🪥", fillGrad: "#bae6fd" },
  consultation: { fill: "#fdf4ff", stroke: "#a855f7", badge: "bg-fuchsia-100 border-fuchsia-400 text-fuchsia-700", icon: "📋", fillGrad: "#f5d0fe" },
  cd: { fill: "#fce7f3", stroke: "#db2777", badge: "bg-pink-100 border-pink-400 text-pink-700", icon: "🦷", fillGrad: "#fbcfe8" },
  full_mouth_implant: { fill: "#ccfbf1", stroke: "#0d9488", badge: "bg-teal-100 border-teal-400 text-teal-700", icon: "⬢", fillGrad: "#99f6e4" },
  cervical_abrasion: { fill: "#fef2e0", stroke: "#d97706", badge: "bg-amber-100 border-amber-500 text-amber-800", icon: "◣", fillGrad: "#fde4b8" },
  attrition: { fill: "#f1f5f9", stroke: "#475569", badge: "bg-slate-100 border-slate-500 text-slate-700", icon: "▽", fillGrad: "#e2e8f0" },
};

// Auto-map condition to default treatment
const conditionTreatmentMap: Partial<Record<ToothCondition, string>> = {
  cavity: "Filling - Composite",
  grossly_decayed: "Extraction",
  missing: "Implant",
  crown: "Crown - Zirconia",
  rct: "Root Canal Treatment",
  filling: "Filling - Composite",
  implant: "Implant",
  bridge: "Bridge",
  fracture: "Extraction",
  mobility: "Extraction",
  impacted: "Extraction",
  ortho: "Root Stumps",
  scaling: "Cleaning / Scaling",
  consultation: "Consultation",
  cd: "Complete Denture",
  full_mouth_implant: "Full Mouth Implant",
  cervical_abrasion: "Cervical Restoration",
  attrition: "Occlusal Adjustment",
};

export const conditionLabels: Record<ToothCondition, string> = {
  healthy: "Healthy",
  cavity: "Cavity / Decay",
  grossly_decayed: "Grossly Decayed",
  missing: "Missing",
  crown: "Crown",
  rct: "Root Canal (RCT)",
  filling: "Filling",
  implant: "Implant",
  bridge: "Bridge",
  fracture: "Fracture",
  mobility: "Mobility",
  impacted: "Impacted",
  ortho: "Root Stumps",
  scaling: "Scaling",
  consultation: "Consultation",
  cd: "CD (Complete Denture)",
  full_mouth_implant: "Full Mouth Implant",
  cervical_abrasion: "Cervical Abrasion",
  attrition: "Attrition",
};

const defaultTreatmentOptions = [
  "Cleaning / Scaling",
  "Filling - Composite",
  "Filling - GIC",
  "Root Canal Treatment",
  "Crown - Ceramic",
  "Crown - Metal",
  "Crown - Zirconia",
  "Extraction",
  "Disimpaction",
  "Implant",
  "Bridge",
  "Braces / Orthodontic",
  "Invisalign",
  "Teeth Whitening",
  "Gum Treatment",
  "Kids Treatment",
  "Observation",
];

const buildTreatmentOptions = (values: Array<string | undefined>) =>
  Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
    )
  );

// FDI notation - Adult (32 teeth)
export const adultUpperRight = [18, 17, 16, 15, 14, 13, 12, 11];
export const adultUpperLeft = [21, 22, 23, 24, 25, 26, 27, 28];
export const adultLowerLeft = [38, 37, 36, 35, 34, 33, 32, 31];
export const adultLowerRight = [41, 42, 43, 44, 45, 46, 47, 48];

// FDI notation - Kids / Primary (20 teeth)
export const kidsUpperRight = [55, 54, 53, 52, 51];
export const kidsUpperLeft = [61, 62, 63, 64, 65];
export const kidsLowerLeft = [75, 74, 73, 72, 71];
export const kidsLowerRight = [81, 82, 83, 84, 85];

export const getToothType = (num: number): "molar" | "premolar" | "canine" | "incisor" => {
  const lastDigit = num % 10;
  // Kids primary teeth (51-85): 4-5 = molar, 3 = canine, 1-2 = incisor
  if (num >= 51) {
    if (lastDigit >= 4) return "molar";
    if (lastDigit === 3) return "canine";
    return "incisor";
  }
  if (lastDigit >= 6) return "molar";
  if (lastDigit >= 4) return "premolar";
  if (lastDigit === 3) return "canine";
  return "incisor";
};

export const isUpperTooth = (num: number) => (num >= 11 && num <= 28) || (num >= 51 && num <= 65);

// Realistic 3D tooth images mapped by position + type
const toothImageMap: Record<string, string> = {
  "upper-molar": upperMolarImg,
  "upper-premolar": upperPremolarImg,
  "upper-canine": upperCanineImg,
  "upper-incisor": upperIncisorImg,
  "lower-molar": lowerMolarImg,
  "lower-premolar": lowerPremolarImg,
  "lower-canine": lowerCanineImg,
  "lower-incisor": lowerIncisorImg,
};

// Photo-realistic tooth renderer using AI-generated 3D images.
// Condition states are layered as colored overlays / markers on top of the natural tooth image,
// matching reference dental chart conventions (red X = missing/extracted, blue solid = crown,
// blue/pink patch = filling/RCT, etc.).
export const ToothSVG = ({ number, type, isUpper, condition, hasSurface, bridgeLeft, bridgeRight }: {
  number: number;
  type: "molar" | "premolar" | "canine" | "incisor";
  isUpper: boolean;
  condition: ToothCondition;
  hasSurface?: string;
  bridgeLeft?: boolean;
  bridgeRight?: boolean;
}) => {
  const img = toothImageMap[`${isUpper ? "upper" : "lower"}-${type}`];
  const colors = conditionColors[condition];

  // Uniform height across the whole arch so crowns sit on a perfectly STRAIGHT line.
  // Only width varies by tooth type to preserve the natural arch proportions
  // (molars wider than incisors). The image uses object-fit: contain with
  // object-position anchored to the crown side (bottom for upper after flip,
  // top for lower) so crowns line up exactly along the gum line.
  const displayW = 44;
  const displayH = 92;

  const isMissing = condition === "missing";
  const isHealthy = condition === "healthy";

  // Condition-specific overlay style. Crown/Implant/Bridge fully tint the crown area,
  // others apply a subtle hue + a marker dot.
  const overlay: { tint?: string; opacity?: number; marker?: string; markerColor?: string } = (() => {
    switch (condition) {
      case "crown":     return { tint: colors.stroke, opacity: 0.55, marker: "♛", markerColor: "#fff" };
      case "implant":   return { tint: colors.stroke, opacity: 0.5, marker: "⬡", markerColor: "#fff" };
      case "bridge":    return { tint: colors.stroke, opacity: 0.5, marker: "⌇", markerColor: "#fff" };
      case "rct":       return { tint: colors.stroke, opacity: 0.45, marker: "⊕", markerColor: "#fff" };
      case "filling":   return { tint: colors.stroke, opacity: 0.4, marker: "■", markerColor: "#fff" };
      case "cavity":    return { tint: colors.stroke, opacity: 0.35, marker: "●", markerColor: colors.stroke };
      case "grossly_decayed": return { tint: colors.stroke, opacity: 0.45, marker: "◉", markerColor: colors.stroke };
      case "fracture":  return { tint: colors.stroke, opacity: 0.3, marker: "⚡", markerColor: colors.stroke };
      case "mobility":  return { tint: colors.stroke, opacity: 0.25, marker: "↔", markerColor: colors.stroke };
      case "impacted":  return { tint: colors.stroke, opacity: 0.3, marker: "▼", markerColor: colors.stroke };
      case "ortho":     return { tint: colors.stroke, opacity: 0.25, marker: "⊞", markerColor: colors.stroke };
      case "scaling":   return { tint: colors.stroke, opacity: 0.2, marker: "🪥", markerColor: colors.stroke };
      case "consultation": return { tint: colors.stroke, opacity: 0.2, marker: "📋", markerColor: colors.stroke };
      default: return {};
    }
  })();

  return (
    <div
      className="relative inline-block"
      style={{ width: displayW, height: displayH }}
    >
      {/* Realistic tooth photo */}
      <img
        src={img}
        alt={`Tooth ${number}`}
        loading="lazy"
        width={displayW}
        height={displayH}
        draggable={false}
        className="absolute inset-0 w-full h-full select-none pointer-events-none"
        style={{
          // Source images: crown at TOP of canvas, root at BOTTOM.
          // Upper jaw → flip vertically so crown points DOWN toward gum line; anchor to bottom.
          // Lower jaw → no flip; crown points UP toward gum line; anchor to top.
          objectFit: "contain",
          objectPosition: isUpper ? "center bottom" : "center top",
          transform: isUpper ? "scaleY(-1)" : undefined,
          opacity: isMissing ? 0.18 : 1,
          filter: isHealthy
            ? "drop-shadow(0 1px 1.5px rgba(0,0,0,0.15))"
            : "drop-shadow(0 1px 1.5px rgba(0,0,0,0.18))",
        }}
      />

      {/* Color tint overlay (uses tooth image as mask via mix-blend) */}
      {overlay.tint && !isMissing && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundColor: overlay.tint,
            opacity: overlay.opacity,
            mixBlendMode: "multiply",
            // Mask to tooth shape using the same image — must match the <img> transform & position
            WebkitMaskImage: `url(${img})`,
            maskImage: `url(${img})`,
            WebkitMaskRepeat: "no-repeat",
            maskRepeat: "no-repeat",
            WebkitMaskSize: "contain",
            maskSize: "contain",
            WebkitMaskPosition: isUpper ? "center bottom" : "center top",
            maskPosition: isUpper ? "center bottom" : "center top",
            transform: isUpper ? "scaleY(-1)" : undefined,
          }}
        />
      )}

      {/* Missing tooth: big red X over faded tooth */}
      {isMissing && (
        <svg
          viewBox="0 0 60 100"
          className="absolute inset-0 w-full h-full pointer-events-none"
          preserveAspectRatio="xMidYMid meet"
        >
          <line x1="10" y1="15" x2="50" y2="85" stroke="#dc2626" strokeWidth="6" strokeLinecap="round" />
          <line x1="50" y1="15" x2="10" y2="85" stroke="#dc2626" strokeWidth="6" strokeLinecap="round" />
        </svg>
      )}

      {/* Cavity / Grossly Decayed: decayed/broken hole on the crown */}
      {(condition === "cavity" || condition === "grossly_decayed") && (
        <svg
          viewBox="0 0 60 100"
          className="absolute inset-0 w-full h-full pointer-events-none"
          preserveAspectRatio="xMidYMid meet"
        >
          {(() => {
            // Crown center y: upper crown is at bottom of cell (~75), lower at top (~25)
            const cy = isUpper ? 75 : 25;
            return (
              <g>
                {/* Dark decay blob */}
                <path
                  d={`M ${30 - 8} ${cy} q 4 -7 8 -2 q 5 -4 8 3 q 2 6 -3 9 q -6 4 -10 1 q -6 -2 -3 -11 z`}
                  fill="#3b1f0e"
                  opacity="0.85"
                />
                {/* Inner darker hole */}
                <ellipse cx="30" cy={cy + 1} rx="4.5" ry="3.5" fill="#1a0a04" opacity="0.95" />
                {/* Jagged edge highlight */}
                <path
                  d={`M ${30 - 7} ${cy - 1} l 3 -2 l 2 2 l 3 -3 l 2 3 l 3 -1`}
                  stroke="#5a2d12"
                  strokeWidth="1"
                  fill="none"
                  opacity="0.7"
                />
              </g>
            );
          })()}
        </svg>
      )}

      {/* Implant: screw post under the crown (in the root area) */}
      {condition === "implant" && (
        <svg
          viewBox="0 0 60 100"
          className="absolute inset-0 w-full h-full pointer-events-none"
          preserveAspectRatio="xMidYMid meet"
        >
          {(() => {
            // Root area: upper root at top of cell, lower root at bottom
            const rootStart = isUpper ? 8 : 50;
            const rootEnd = isUpper ? 50 : 92;
            const threads = 6;
            const step = (rootEnd - rootStart) / threads;
            return (
              <g>
                {/* Screw body */}
                <rect
                  x={30 - 7}
                  y={rootStart}
                  width={14}
                  height={rootEnd - rootStart}
                  rx={2}
                  fill="#9ca3af"
                  stroke="#475569"
                  strokeWidth="1.2"
                />
                {/* Thread lines */}
                {Array.from({ length: threads }).map((_, i) => (
                  <line
                    key={i}
                    x1={30 - 7}
                    y1={rootStart + step * (i + 0.5)}
                    x2={30 + 7}
                    y2={rootStart + step * (i + 0.5) + 2}
                    stroke="#475569"
                    strokeWidth="1.2"
                  />
                ))}
                {/* Screw tip */}
                <polygon
                  points={
                    isUpper
                      ? `${30 - 7},${rootStart} 30,${rootStart - 5} ${30 + 7},${rootStart}`
                      : `${30 - 7},${rootEnd} 30,${rootEnd + 5} ${30 + 7},${rootEnd}`
                  }
                  fill="#9ca3af"
                  stroke="#475569"
                  strokeWidth="1.2"
                />
              </g>
            );
          })()}
        </svg>
      )}

      {/* Bridge: golden cap on crown + connector bar to adjacent bridge teeth */}
      {condition === "bridge" && (
        <svg
          viewBox="0 0 60 100"
          className="absolute pointer-events-none overflow-visible"
          style={{ inset: 0, width: "100%", height: "100%" }}
          preserveAspectRatio="none"
        >
          {(() => {
            // Crown band y range
            const bandY = isUpper ? 60 : 22;
            const bandH = 18;
            return (
              <g>
                {/* Golden crown cap on this tooth */}
                <rect
                  x={6}
                  y={bandY}
                  width={48}
                  height={bandH}
                  rx={3}
                  fill="url(#bridgeGrad)"
                  stroke="#a16207"
                  strokeWidth="1.2"
                  opacity="0.92"
                />
                <defs>
                  <linearGradient id="bridgeGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fde68a" />
                    <stop offset="50%" stopColor="#f59e0b" />
                    <stop offset="100%" stopColor="#b45309" />
                  </linearGradient>
                </defs>
                {/* Connector bar extending LEFT to neighbor */}
                {bridgeLeft && (
                  <rect
                    x={-12}
                    y={bandY + 4}
                    width={20}
                    height={bandH - 8}
                    fill="#f59e0b"
                    stroke="#a16207"
                    strokeWidth="1"
                  />
                )}
                {/* Connector bar extending RIGHT to neighbor */}
                {bridgeRight && (
                  <rect
                    x={52}
                    y={bandY + 4}
                    width={20}
                    height={bandH - 8}
                    fill="#f59e0b"
                    stroke="#a16207"
                    strokeWidth="1"
                  />
                )}
                {/* Subtle highlight */}
                <line
                  x1={8}
                  y1={bandY + 3}
                  x2={52}
                  y2={bandY + 3}
                  stroke="#fef3c7"
                  strokeWidth="1.2"
                  opacity="0.8"
                />
              </g>
            );
          })()}
        </svg>
      )}

      {/* Surface marker dot — always on the CROWN side (bottom for upper, top for lower) */}
      {hasSurface && !isHealthy && !isMissing && (() => {
        const cy = isUpper ? "70%" : "30%";
        const sm: Record<string, { left: string; top: string }> = {
          mesial:   { left: "30%", top: cy },
          distal:   { left: "70%", top: cy },
          occlusal: { left: "50%", top: cy },
          buccal:   { left: "50%", top: isUpper ? "78%" : "22%" },
          lingual:  { left: "50%", top: isUpper ? "58%" : "42%" },
          multiple: { left: "50%", top: cy },
        };
        const pos = sm[hasSurface] || sm.occlusal;
        return (
          <span
            className="absolute rounded-full pointer-events-none"
            style={{
              left: pos.left,
              top: pos.top,
              width: 7,
              height: 7,
              transform: "translate(-50%, -50%)",
              backgroundColor: colors.stroke,
              opacity: 0.8,
              boxShadow: "0 0 0 1.5px rgba(255,255,255,0.85)",
            }}
          />
        );
      })()}

      {/* Condition icon marker — always on the CROWN (bottom for upper, top for lower) */}
      {overlay.marker && !isMissing && condition !== "cavity" && condition !== "implant" && condition !== "bridge" && (
        <span
          className="absolute font-bold pointer-events-none"
          style={{
            left: "50%",
            top: isUpper ? "74%" : "26%",
            transform: "translate(-50%, -50%)",
            fontSize: type === "molar" ? 13 : 11,
            color: overlay.markerColor,
            textShadow:
              overlay.markerColor === "#fff"
                ? "0 1px 2px rgba(0,0,0,0.5)"
                : "0 0 3px white, 0 0 3px white, 0 0 2px white",
            lineHeight: 1,
          }}
        >
          {overlay.marker}
        </span>
      )}
    </div>
  );
};

const VisualTooth = ({ number, entry, allEntries, onClick, isSelected, multiMode, bridgeLeft, bridgeRight }: {
  number: number; entry?: ToothEntry; allEntries?: ToothEntry[]; onClick: () => void; isSelected?: boolean; multiMode?: boolean;
  bridgeLeft?: boolean; bridgeRight?: boolean;
}) => {
  const condition = entry?.condition || "healthy";
  const type = getToothType(number);
  const isUpper = isUpperTooth(number);
  const findingsCount = allEntries?.length ?? 0;
  const mobilityEntry = allEntries?.find((e) => e.condition === "mobility");
  const mobilityGradeLabel = mobilityEntry?.mobility_grade
    ? `Mobility - ${mobilityEntry.mobility_grade.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}`
    : null;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onClick}
            className={cn(
              "flex flex-col items-center gap-0 transition-all hover:scale-110 cursor-pointer group relative",
              isUpper ? "flex-col" : "flex-col-reverse",
              multiMode && isSelected && "ring-2 ring-primary rounded-md bg-primary/10"
            )}
          >
            {isUpper ? (
              <>
                <span className={cn(
                  "text-[11px] font-bold transition-colors",
                  condition !== "healthy" ? "text-foreground" : "text-muted-foreground",
                  multiMode && isSelected && "text-primary"
                )}>
                  {number}
                </span>
                {mobilityGradeLabel && (
                  <span className="text-[9px] font-medium leading-tight text-center px-1 py-0.5 rounded bg-yellow-100 text-yellow-700 border border-yellow-300 max-w-[52px]">
                    {mobilityGradeLabel}
                  </span>
                )}
              </>
            ) : (
              <>
                {mobilityGradeLabel && (
                  <span className="text-[9px] font-medium leading-tight text-center px-1 py-0.5 rounded bg-yellow-100 text-yellow-700 border border-yellow-300 max-w-[52px]">
                    {mobilityGradeLabel}
                  </span>
                )}
                <span className={cn(
                  "text-[11px] font-bold transition-colors",
                  condition !== "healthy" ? "text-foreground" : "text-muted-foreground",
                  multiMode && isSelected && "text-primary"
                )}>
                  {number}
                </span>
              </>
            )}
            <div className="relative group-hover:drop-shadow-md transition-all">
              <ToothSVG number={number} type={type} isUpper={isUpper} condition={condition} hasSurface={entry?.surface} bridgeLeft={bridgeLeft} bridgeRight={bridgeRight} />
              {findingsCount > 1 && (
                <div className="absolute -top-1 -left-1 min-w-[14px] h-[14px] px-[3px] bg-warning text-warning-foreground rounded-full flex items-center justify-center border border-background">
                  <span className="text-[9px] font-bold leading-none">{findingsCount}</span>
                </div>
              )}
              {multiMode && isSelected && (
                <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-primary rounded-full flex items-center justify-center">
                  <span className="text-[8px] text-primary-foreground font-bold">✓</span>
                </div>
              )}
            </div>
          </button>
        </TooltipTrigger>
        <TooltipContent side={isUpper ? "top" : "bottom"} className="text-xs">
          <p className="font-bold">Tooth #{number}</p>
          {findingsCount > 1 ? (
            <ul className="space-y-0.5">
              {allEntries!.map((e, i) => (
                <li key={i}>
                  • {conditionLabels[e.condition]}{e.treatment_needed ? ` → ${e.treatment_needed}` : ""}
                </li>
              ))}
            </ul>
          ) : (
            <>
              <p>{conditionLabels[condition]}</p>
              {entry?.treatment_needed && <p className="text-muted-foreground">→ {entry.treatment_needed}</p>}
              {entry?.surface && <p className="text-muted-foreground">Surface: {entry.surface}</p>}
              {entry?.mobility_grade && <p className="text-muted-foreground">Mobility: {entry.mobility_grade.replace('_', ' ')}</p>}
            </>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export const ToothChart = ({ entries, onToothClick, onSaveEntry, generalFindings: externalGeneralFindings, onGeneralFindingsChange, chartType = "adult", onChartModeChange, onProceedToTreatment, onUndoProceed, onDeleteFinding, proceededTeeth, proceededGeneralConditions, readOnly = false }: ToothChartProps) => {
  const { treatmentNames } = useClinicMasters();
  const [selectedTooth, setSelectedTooth] = useState<number | null>(null);
  const [editEntry, setEditEntry] = useState<Partial<ToothEntry>>({});
  
  // General findings (scaling, consultation) - no teeth needed
  const [internalGeneralFindings, setInternalGeneralFindings] = useState<Array<{ condition: ToothCondition; treatment_needed: string }>>([]);
  const generalFindings = externalGeneralFindings ?? internalGeneralFindings;
  const updateGeneralFindings = (
    updater: (prev: Array<{ condition: ToothCondition; treatment_needed: string }>) => Array<{ condition: ToothCondition; treatment_needed: string }>
  ) => {
    const next = updater(generalFindings as Array<{ condition: ToothCondition; treatment_needed: string }>);
    if (onGeneralFindingsChange) onGeneralFindingsChange(next);
    else setInternalGeneralFindings(next);
  };
  
  // Tooth selection for proceed
  const [selectingGroupKey, setSelectingGroupKey] = useState<string | null>(null);
  const [proceedSelectedTeeth, setProceedSelectedTeeth] = useState<Set<number>>(new Set());
  
  // Multi-select mode
  const [multiMode, setMultiMode] = useState(false);
  const [selectedTeeth, setSelectedTeeth] = useState<Set<number>>(new Set());

  // Paint mode: pick a condition, then click teeth to apply directly (no dialog)
  const [paintCondition, setPaintCondition] = useState<ToothCondition | null>(null);
  const [mobilityPicker, setMobilityPicker] = useState<{ toothNumber: number } | null>(null);
  const [multiEditOpen, setMultiEditOpen] = useState(false);
  const [multiEdit, setMultiEdit] = useState<Partial<ToothEntry>>({ condition: "cavity" });
  const [chartMode, setChartMode] = useState<"adult" | "kids">(chartType === "child" ? "kids" : "adult");
  const treatmentOptions = useMemo(
    () =>
      buildTreatmentOptions([
        ...treatmentNames,
        ...defaultTreatmentOptions,
        ...entries.map((entry) => entry.treatment_needed),
        editEntry.treatment_needed,
        multiEdit.treatment_needed,
      ]),
    [entries, editEntry.treatment_needed, multiEdit.treatment_needed, treatmentNames]
  );

  const upperRight = chartMode === "adult" ? adultUpperRight : kidsUpperRight;
  const upperLeft = chartMode === "adult" ? adultUpperLeft : kidsUpperLeft;
  const lowerLeft = chartMode === "adult" ? adultLowerLeft : kidsLowerLeft;
  const lowerRight = chartMode === "adult" ? adultLowerRight : kidsLowerRight;

  const getEntries = (num: number) => entries.filter((e) => e.tooth_number === num && e.condition !== "healthy");
  const getEntry = (num: number) => getEntries(num)[0];

  const handleClick = (num: number) => {
    if (readOnly) return;
    if (multiMode) {
      setSelectedTeeth(prev => {
        const next = new Set(prev);
        if (next.has(num)) next.delete(num);
        else next.add(num);
        return next;
      });
      return;
    }
    // Paint mode: apply selected condition. Multiple findings per tooth allowed.
    if (paintCondition) {
      const sameCondEntry = getEntries(num).find((e) => e.condition === paintCondition);
      if (sameCondEntry) {
        // Toggle off — remove only this specific finding via "healthy" sentinel for this condition.
        // Use onDeleteFinding-style removal: set entry to healthy only if it's the only finding.
        const all = getEntries(num);
        if (all.length <= 1) {
          onSaveEntry({ tooth_number: num, condition: "healthy" });
        } else {
          // Re-emit all remaining findings; clearing happens via healthy then re-add others.
          onSaveEntry({ tooth_number: num, condition: "healthy" });
          all.filter((e) => e.condition !== paintCondition).forEach((e) => onSaveEntry(e));
        }
      } else if (paintCondition === "mobility") {
        setMobilityPicker({ toothNumber: num });
        return;
      } else {
        onSaveEntry({ tooth_number: num, condition: paintCondition });
      }
      return;
    }
    setSelectedTooth(num);
    const existing = getEntry(num);
    setEditEntry(existing || { tooth_number: num, condition: "healthy" });
    onToothClick(num);
  };

  const handleSave = () => {
    if (selectedTooth && editEntry.condition) {
      onSaveEntry({
        tooth_number: selectedTooth,
        condition: editEntry.condition as ToothCondition,
        treatment_needed: editEntry.treatment_needed,
        notes: editEntry.notes,
        surface: editEntry.surface,
        mobility_grade: editEntry.condition === "mobility" ? editEntry.mobility_grade as MobilityGrade : undefined,
      });
      setSelectedTooth(null);
      setEditEntry({});
    }
  };

  const handleMultiSave = () => {
    if (selectedTeeth.size === 0 || !multiEdit.condition) return;
    selectedTeeth.forEach(toothNum => {
      onSaveEntry({
        tooth_number: toothNum,
        condition: multiEdit.condition as ToothCondition,
        treatment_needed: multiEdit.treatment_needed,
        notes: multiEdit.notes,
        surface: multiEdit.surface,
        mobility_grade: multiEdit.condition === "mobility" ? multiEdit.mobility_grade as MobilityGrade : undefined,
      });
    });
    setMultiEditOpen(false);
    setSelectedTeeth(new Set());
    setMultiMode(false);
    setMultiEdit({ condition: paintCondition || "cavity" });
  };

  const handleQuickCondition = (condition: ToothCondition) => {
    const autoTreatment = conditionTreatmentMap[condition];
    setEditEntry({ 
      ...editEntry, 
      condition,
      treatment_needed: autoTreatment || editEntry.treatment_needed || "",
    });
  };

  // Conditions that don't need tooth selection
  const generalConditions: ToothCondition[] = ["scaling", "consultation", "cd", "full_mouth_implant"];
  // Conditions shown in tooth-level selector (exclude general ones)
  const toothConditions = Object.keys(conditionLabels).filter(
    (k) => !generalConditions.includes(k as ToothCondition)
  ) as ToothCondition[];

  const handleAddGeneralFinding = (condition: ToothCondition) => {
    const treatment = conditionTreatmentMap[condition] || conditionLabels[condition];
    // Don't add duplicate
    if (generalFindings.some((f) => f.condition === condition)) return;
    updateGeneralFindings((prev) => [...prev, { condition, treatment_needed: treatment }]);
  };

  const handleRemoveGeneralFinding = (condition: ToothCondition) => {
    updateGeneralFindings((prev) => prev.filter((f) => f.condition !== condition));
  };

  const toggleMultiMode = () => {
    if (multiMode) {
      setMultiMode(false);
      setSelectedTeeth(new Set());
    } else {
      setMultiMode(true);
      // Keep paintCondition so the user's selected finding (e.g. "cavity")
      // carries over into the multi-edit dialog as the default.
    }
  };

  const renderToothRow = (teeth: number[]) =>
    teeth.map((n, idx) => {
      const isBridge = getEntry(n)?.condition === "bridge";
      const leftNum = teeth[idx - 1];
      const rightNum = teeth[idx + 1];
      const bridgeLeft = isBridge && leftNum != null && getEntry(leftNum)?.condition === "bridge";
      const bridgeRight = isBridge && rightNum != null && getEntry(rightNum)?.condition === "bridge";
      return (
        <VisualTooth
          key={n}
          number={n}
          entry={getEntry(n)}
          allEntries={getEntries(n)}
          onClick={() => handleClick(n)}
          isSelected={selectedTeeth.has(n)}
          multiMode={multiMode}
          bridgeLeft={bridgeLeft}
          bridgeRight={bridgeRight}
        />
      );
    });

  // Show all findings (keep them visible even after proceed)
  const findingEntries = entries.filter((e) => e.condition !== "healthy");
  const groupedFindings = Object.values(
    findingEntries.reduce((acc, entry) => {
      const key = `${entry.condition}__${entry.treatment_needed || ""}`;
      if (!acc[key]) {
        acc[key] = {
          condition: entry.condition,
          treatment_needed: entry.treatment_needed,
          teeth: [] as number[],
          surfaces: new Set<string>(),
        };
      }

      acc[key].teeth.push(entry.tooth_number);
      if (entry.surface) acc[key].surfaces.add(entry.surface);
      return acc;
    }, {} as Record<string, {
      condition: ToothCondition;
      treatment_needed?: string;
      teeth: number[];
      surfaces: Set<string>;
    }>)
  ).map((group) => ({
    ...group,
    teeth: group.teeth.sort((a, b) => a - b),
    surfaces: Array.from(group.surfaces),
  }));

  return (
    <div className="space-y-4">
      {/* Chart Mode Toggle + Legend + Multi-select */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted">
            <Button
              variant={chartMode === "adult" ? "default" : "ghost"}
              size="sm"
              onClick={() => { setChartMode("adult"); setSelectedTeeth(new Set()); onChartModeChange?.("adult"); }}
              className="h-8 text-sm px-4 rounded-md"
            >
              Adult (32)
            </Button>
            <Button
              variant={chartMode === "kids" ? "default" : "ghost"}
              size="sm"
              onClick={() => { setChartMode("kids"); setSelectedTeeth(new Set()); onChartModeChange?.("kids"); }}
              className="h-8 text-sm px-4 rounded-md"
            >
              Kids (20)
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!readOnly && (
          <Button
            variant={multiMode ? "default" : "outline"}
            size="sm"
            onClick={toggleMultiMode}
            className="gap-1.5 text-sm h-8"
          >
            {multiMode ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
            Multi Select
          </Button>
          )}
        </div>
      </div>
      {/* Paint-mode condition selector: tap a condition then click teeth to apply directly */}
      {!readOnly && (
      <div className="rounded-lg border border-border bg-muted/30 p-2">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-xs font-semibold text-foreground">Quick Mark:</span>
          <span className="text-[11px] text-muted-foreground">
            {paintCondition
              ? `Click teeth to mark as ${conditionLabels[paintCondition]} (click again to undo)`
              : "Pick a condition, then click teeth to mark instantly"}
          </span>
          {paintCondition && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[11px] ml-auto"
              onClick={() => setPaintCondition(null)}
            >
              Done
            </Button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(conditionLabels)
            .filter(([key]) => !generalConditions.includes(key as ToothCondition))
            .map(([key, label]) => {
              const cond = key as ToothCondition;
              const c = conditionColors[cond];
              const isActive = paintCondition === cond;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    const nextCond = isActive ? null : cond;
                    setPaintCondition(nextCond);
                    // Keep multi-mode active so the chosen finding is reused
                    // when applying to multiple selected teeth.
                    if (nextCond) {
                      setMultiEdit((prev) => ({
                        ...prev,
                        condition: nextCond,
                        treatment_needed:
                          conditionTreatmentMap[nextCond] || prev.treatment_needed || "",
                      }));
                    }
                  }}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border-2 text-xs font-medium transition-all",
                    isActive ? "shadow-md scale-105" : "hover:opacity-100 opacity-80"
                  )}
                  style={{
                    backgroundColor: isActive ? c.stroke : c.fill,
                    borderColor: c.stroke,
                    color: isActive ? "#fff" : c.stroke,
                  }}
                >
                  <span>{c.icon}</span>
                  <span>{label}</span>
                </button>
              );
            })}
        </div>
      </div>
      )}

      {/* Multi-select toolbar */}
      {multiMode && (
        <div className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-lg px-3 py-2">
          <span className="text-sm font-medium text-primary">
            {selectedTeeth.size} teeth selected
          </span>
          <div className="flex-1" />
          {selectedTeeth.size > 0 && (
            <Button size="sm" className="h-8 text-sm gap-1" onClick={() => {
              // Always sync the multi-edit dialog with the currently picked
              // Quick Mark condition so the popup matches what the doctor chose.
              const cond = (paintCondition || multiEdit.condition || "cavity") as ToothCondition;
              setMultiEdit((prev) => ({
                ...prev,
                condition: cond,
                treatment_needed: conditionTreatmentMap[cond] || prev.treatment_needed || "",
              }));
              setMultiEditOpen(true);
            }}>
              Apply to {selectedTeeth.size} teeth
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-8 text-sm" onClick={() => setSelectedTeeth(new Set())}>
            Clear
          </Button>
        </div>
      )}

      {/* Chart */}
      <div className="bg-card rounded-xl border border-border p-4 sm:p-6 relative">
        <div className="text-center mb-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Upper Jaw (Maxillary)</span>
        </div>
        <div className="flex justify-center items-end gap-[2px] sm:gap-1">
          <span className="text-[11px] font-bold text-muted-foreground mr-1 self-center">R</span>
          {renderToothRow(upperRight)}
          <div className="w-[2px] bg-primary/30 self-stretch mx-1.5 rounded-full" />
          {renderToothRow(upperLeft)}
          <span className="text-[11px] font-bold text-muted-foreground ml-1 self-center">L</span>
        </div>
        <div className="my-2 relative">
          <div className="border-t-2 border-dashed border-rose-300/40" />
          <div className="absolute left-1/2 -translate-x-1/2 -top-2 bg-card px-2">
            <span className="text-[9px] text-rose-400 font-medium">gum line</span>
          </div>
        </div>
        <div className="flex justify-center items-start gap-[2px] sm:gap-1">
          <span className="text-[11px] font-bold text-muted-foreground mr-1 self-center">R</span>
          {renderToothRow([...lowerRight].reverse())}
          <div className="w-[2px] bg-primary/30 self-stretch mx-1.5 rounded-full" />
          {renderToothRow([...lowerLeft].reverse())}
          <span className="text-[11px] font-bold text-muted-foreground ml-1 self-center">L</span>
        </div>
        <div className="text-center mt-1">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Lower Jaw (Mandibular)</span>
        </div>
      </div>

      {/* Quick General Findings (no teeth needed) */}
      {!readOnly && (
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-muted-foreground">Quick Add:</span>
        {generalConditions.map((cond) => {
          const c = conditionColors[cond];
          const isAdded = generalFindings.some((f) => f.condition === cond);
          return (
            <Button
              key={cond}
              variant={isAdded ? "default" : "outline"}
              size="sm"
              className="h-8 text-xs gap-1.5"
              style={isAdded ? { backgroundColor: c.stroke, borderColor: c.stroke } : { borderColor: c.stroke, color: c.stroke }}
              onClick={() => isAdded ? handleRemoveGeneralFinding(cond) : handleAddGeneralFinding(cond)}
            >
              <span>{c.icon}</span>
              {conditionLabels[cond]}
              {isAdded && <X size={12} />}
            </Button>
          );
        })}
      </div>
      )}

      {/* Findings Summary */}
      {(groupedFindings.length > 0 || generalFindings.length > 0) && (
        <div className="bg-secondary/50 rounded-lg p-3">
          <p className="text-sm font-semibold mb-2">
            Findings ({groupedFindings.length + generalFindings.length})
          </p>
          <div className="space-y-2">
            {/* General findings (scaling, consultation) - no teeth */}
            {generalFindings.map((gf) => {
              const isProceeded = proceededGeneralConditions?.has(gf.condition) ?? false;
              return (
              <div
                key={gf.condition}
                className={cn(
                  "flex items-center gap-3 rounded-lg border p-2",
                  isProceeded ? "border-emerald-400 bg-emerald-50/70" : "border-border bg-background/70"
                )}
              >
                <div
                  className="h-10 w-10 rounded-lg border-2 flex items-center justify-center text-lg shrink-0"
                  style={{
                    backgroundColor: conditionColors[gf.condition].fill,
                    borderColor: conditionColors[gf.condition].stroke,
                  }}
                >
                  {conditionColors[gf.condition].icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className={cn("text-[10px]", conditionColors[gf.condition].badge)}>
                      General
                    </Badge>
                    <span className="font-medium text-sm">{conditionLabels[gf.condition]}</span>
                    <span className="text-sm text-muted-foreground">→ {gf.treatment_needed}</span>
                    {isProceeded && (
                      <Badge className="text-[10px] bg-emerald-500 text-white border-emerald-600 gap-1">
                        ✓ Proceeded
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">All teeth / Full mouth</p>
                </div>
                {!readOnly && (
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    onClick={() => handleRemoveGeneralFinding(gf.condition)}
                  >
                    <X size={14} />
                  </Button>
                  {isProceeded && onUndoProceed ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs h-8 whitespace-nowrap border-amber-400 text-amber-700 hover:bg-amber-50"
                      onClick={() => onUndoProceed({ condition: gf.condition, treatment_needed: gf.treatment_needed, teeth: [] })}
                    >
                      <Undo2 size={14} /> Undo
                    </Button>
                  ) : onProceedToTreatment && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs h-8 whitespace-nowrap border-primary/30 text-primary hover:bg-primary/10"
                      onClick={() => {
                        onProceedToTreatment({
                          condition: gf.condition,
                          treatment_needed: gf.treatment_needed,
                          teeth: [],
                        });
                      }}
                    >
                      Proceed <ArrowRight size={14} />
                    </Button>
                  )}
                </div>
                )}
              </div>
              );
            })}

            {/* Tooth-specific findings */}
            {groupedFindings.map((group) => {
              const quadrantTeeth = {
                Q1: group.teeth.filter((tooth) => ["1", "5"].includes(String(tooth)[0])),
                Q2: group.teeth.filter((tooth) => ["2", "6"].includes(String(tooth)[0])),
                Q3: group.teeth.filter((tooth) => ["3", "7"].includes(String(tooth)[0])),
                Q4: group.teeth.filter((tooth) => ["4", "8"].includes(String(tooth)[0])),
              };

              return (
                <div
                  key={`${group.condition}-${group.treatment_needed ?? "none"}-${group.teeth.join("-")}`}
                  className="flex items-stretch gap-3 rounded-lg border border-border bg-background/70 p-2"
                >
                  <div className="grid grid-cols-2 gap-px rounded-md overflow-hidden bg-border self-start">
                    {(["Q1", "Q2", "Q4", "Q3"] as const).map((quadrant, index) => (
                      <div
                        key={quadrant}
                        className={cn(
                          "min-h-11 px-1 py-1 flex items-center justify-center text-center text-[10px] font-semibold leading-tight bg-background",
                          index === 0 && "rounded-tl-md",
                          index === 1 && "rounded-tr-md",
                          index === 2 && "rounded-bl-md",
                          index === 3 && "rounded-br-md",
                          quadrantTeeth[quadrant].length > 0 && "bg-primary/10 text-primary"
                        )}
                      >
                        {quadrantTeeth[quadrant].length > 0 ? quadrantTeeth[quadrant].map(t => t % 10).join(", ") : quadrant}
                      </div>
                    ))}
                  </div>

                  <div className="min-w-0 space-y-1 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={cn("text-[10px]", conditionColors[group.condition].badge)}>
                        {group.teeth.length} tooth{group.teeth.length > 1 ? "s" : ""}
                      </Badge>
                      <span className="font-medium text-sm">{conditionLabels[group.condition]}</span>
                      {group.treatment_needed && (
                        <span className="text-sm text-muted-foreground">→ {group.treatment_needed}</span>
                      )}
                    </div>

                    <div className="text-xs text-muted-foreground">
                      Teeth: {group.teeth.join(", ")}
                      {group.surfaces.length > 0 && ` • Surface: ${group.surfaces.join(", ")}`}
                    </div>
                  </div>

                  {!readOnly && (
                  <div className="flex flex-col items-end gap-1">
                    {(() => {
                      const groupKey = `${group.condition}__${group.treatment_needed || ""}`;
                      const isSelecting = selectingGroupKey === groupKey;
                      const allProceeded = proceededTeeth && group.teeth.every((t) => proceededTeeth.has(t));

                      return (
                        <>
                          {isSelecting ? (
                            <div className="flex flex-col gap-1 items-end">
                              <div className="flex flex-wrap gap-1">
                                {group.teeth.map((t) => (
                                  <button
                                    key={t}
                                    className={cn(
                                      "h-7 min-w-[28px] px-1 rounded border text-xs font-semibold transition-colors",
                                      proceedSelectedTeeth.has(t)
                                        ? "bg-primary text-primary-foreground border-primary"
                                        : "bg-background text-foreground border-border hover:border-primary/50"
                                    )}
                                    onClick={() => {
                                      setProceedSelectedTeeth((prev) => {
                                        const next = new Set(prev);
                                        next.has(t) ? next.delete(t) : next.add(t);
                                        return next;
                                      });
                                    }}
                                  >
                                    {t}
                                  </button>
                                ))}
                              </div>
                              <div className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 text-[10px] px-2"
                                  onClick={() => { setSelectingGroupKey(null); setProceedSelectedTeeth(new Set()); }}
                                >
                                  Cancel
                                </Button>
                                <Button
                                  size="sm"
                                  className="h-6 text-[10px] px-2 gap-1"
                                  disabled={proceedSelectedTeeth.size === 0}
                                  onClick={() => {
                                    onProceedToTreatment?.({
                                      condition: group.condition,
                                      treatment_needed: group.treatment_needed,
                                      teeth: Array.from(proceedSelectedTeeth).sort((a, b) => a - b),
                                    });
                                    setSelectingGroupKey(null);
                                    setProceedSelectedTeeth(new Set());
                                  }}
                                >
                                  Confirm <ArrowRight size={12} />
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              {/* Delete finding */}
                              {onDeleteFinding && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive hover:text-destructive"
                                  onClick={() => onDeleteFinding({
                                    condition: group.condition,
                                    treatment_needed: group.treatment_needed,
                                    teeth: group.teeth,
                                  })}
                                >
                                  <Trash2 size={14} />
                                </Button>
                              )}
                              {/* Undo proceed */}
                              {allProceeded && onUndoProceed && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 text-xs gap-1 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                                  onClick={() => onUndoProceed({
                                    condition: group.condition,
                                    treatment_needed: group.treatment_needed,
                                    teeth: group.teeth,
                                  })}
                                >
                                  <Undo2 size={14} /> Undo
                                </Button>
                              )}
                              {/* Proceed button (only if not all proceeded) */}
                              {!allProceeded && onProceedToTreatment && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="gap-1.5 text-xs h-8 whitespace-nowrap border-primary/30 text-primary hover:bg-primary/10"
                                  onClick={() => {
                                    if (group.teeth.length === 1) {
                                      onProceedToTreatment({
                                        condition: group.condition,
                                        treatment_needed: group.treatment_needed,
                                        teeth: group.teeth,
                                      });
                                    } else {
                                      setSelectingGroupKey(groupKey);
                                      setProceedSelectedTeeth(new Set(group.teeth));
                                    }
                                  }}
                                >
                                  Proceed <ArrowRight size={14} />
                                </Button>
                              )}
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Single tooth edit dialog */}
      <Dialog open={selectedTooth !== null} onOpenChange={(open) => !open && setSelectedTooth(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="h-10 w-10 rounded-lg border-2 flex items-center justify-center font-bold text-lg"
                  style={{
                    backgroundColor: conditionColors[(editEntry.condition || "healthy") as ToothCondition].fill,
                    borderColor: conditionColors[(editEntry.condition || "healthy") as ToothCondition].stroke,
                    color: conditionColors[(editEntry.condition || "healthy") as ToothCondition].stroke,
                  }}
                >
                  {selectedTooth}
                </div>
                <div>
                  <p className="text-base">Tooth #{selectedTooth}</p>
                  <p className="text-xs text-muted-foreground font-normal">
                    {getToothType(selectedTooth || 11)} · {isUpperTooth(selectedTooth || 11) ? "Upper" : "Lower"} jaw
                  </p>
                </div>
              </div>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs font-semibold mb-2 block">Condition (tap to select)</Label>
              <div className="grid grid-cols-4 gap-1.5">
                {Object.entries(conditionLabels).filter(([key]) => !generalConditions.includes(key as ToothCondition)).map(([key, label]) => {
                  const c = conditionColors[key as ToothCondition];
                  const isSelected = editEntry.condition === key;
                  return (
                    <button
                      key={key}
                      onClick={() => handleQuickCondition(key as ToothCondition)}
                      className={cn(
                        "flex flex-col items-center gap-0.5 p-2 rounded-lg border-2 transition-all text-center",
                        isSelected
                          ? "scale-105 shadow-md"
                          : "opacity-60 hover:opacity-100 border-transparent hover:border-border"
                      )}
                      style={{
                        backgroundColor: isSelected ? c.fill : undefined,
                        borderColor: isSelected ? c.stroke : undefined,
                      }}
                    >
                      <span className="text-sm">{c.icon}</span>
                      <span className="text-[9px] font-medium leading-tight">{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Surface</Label>
                <Select value={editEntry.surface || ""} onValueChange={(v) => setEditEntry({ ...editEntry, surface: v })}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mesial">Mesial (M)</SelectItem>
                    <SelectItem value="distal">Distal (D)</SelectItem>
                    <SelectItem value="occlusal">Occlusal (O)</SelectItem>
                    <SelectItem value="buccal">Buccal (B)</SelectItem>
                    <SelectItem value="lingual">Lingual (L)</SelectItem>
                    <SelectItem value="multiple">Multiple</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Treatment Needed</Label>
                <Select value={editEntry.treatment_needed || ""} onValueChange={(v) => setEditEntry({ ...editEntry, treatment_needed: v })}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {treatmentOptions.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {editEntry.condition === "mobility" && (
              <div>
                <Label className="text-xs">Mobility Grade</Label>
                <Select value={editEntry.mobility_grade || ""} onValueChange={(v) => setEditEntry({ ...editEntry, mobility_grade: v as MobilityGrade })}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select Grade" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="grade_1">Grade 1 - Slight</SelectItem>
                    <SelectItem value="grade_2">Grade 2 - Moderate</SelectItem>
                    <SelectItem value="grade_3">Grade 3 - Severe</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label className="text-xs">Notes</Label>
              <Input value={editEntry.notes || ""} onChange={(e) => setEditEntry({ ...editEntry, notes: e.target.value })} placeholder="Additional notes..." className="h-9" />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" size="sm" onClick={() => setSelectedTooth(null)}>Cancel</Button>
              <Button size="sm" onClick={handleSave} className="gap-1">Save Tooth #{selectedTooth}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Multi-select apply dialog */}
      <Dialog open={multiEditOpen} onOpenChange={setMultiEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Apply to {selectedTeeth.size} Teeth
            </DialogTitle>
          </DialogHeader>
          <div className="mb-3">
            <div className="flex flex-wrap gap-1">
              {Array.from(selectedTeeth).sort((a, b) => a - b).map(t => (
                <Badge key={t} variant="outline" className="text-xs">#{t}</Badge>
              ))}
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <Label className="text-xs font-semibold mb-2 block">Condition</Label>
              <div className="grid grid-cols-4 gap-1.5">
                {Object.entries(conditionLabels).filter(([key]) => !generalConditions.includes(key as ToothCondition)).map(([key, label]) => {
                  const c = conditionColors[key as ToothCondition];
                  const isSelected = multiEdit.condition === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setMultiEdit({ ...multiEdit, condition: key as ToothCondition, treatment_needed: conditionTreatmentMap[key as ToothCondition] || multiEdit.treatment_needed || "" })}
                      className={cn(
                        "flex flex-col items-center gap-0.5 p-2 rounded-lg border-2 transition-all text-center",
                        isSelected
                          ? "scale-105 shadow-md"
                          : "opacity-60 hover:opacity-100 border-transparent hover:border-border"
                      )}
                      style={{
                        backgroundColor: isSelected ? c.fill : undefined,
                        borderColor: isSelected ? c.stroke : undefined,
                      }}
                    >
                      <span className="text-sm">{c.icon}</span>
                      <span className="text-[9px] font-medium leading-tight">{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Surface</Label>
                <Select value={multiEdit.surface || ""} onValueChange={(v) => setMultiEdit({ ...multiEdit, surface: v })}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mesial">Mesial (M)</SelectItem>
                    <SelectItem value="distal">Distal (D)</SelectItem>
                    <SelectItem value="occlusal">Occlusal (O)</SelectItem>
                    <SelectItem value="buccal">Buccal (B)</SelectItem>
                    <SelectItem value="lingual">Lingual (L)</SelectItem>
                    <SelectItem value="multiple">Multiple</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Treatment Needed</Label>
                <Select value={multiEdit.treatment_needed || ""} onValueChange={(v) => setMultiEdit({ ...multiEdit, treatment_needed: v })}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {treatmentOptions.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {multiEdit.condition === "mobility" && (
              <div>
                <Label className="text-xs">Mobility Grade</Label>
                <Select value={multiEdit.mobility_grade || ""} onValueChange={(v) => setMultiEdit({ ...multiEdit, mobility_grade: v as MobilityGrade })}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select Grade" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="grade_1">Grade 1 - Slight</SelectItem>
                    <SelectItem value="grade_2">Grade 2 - Moderate</SelectItem>
                    <SelectItem value="grade_3">Grade 3 - Severe</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label className="text-xs">Notes</Label>
              <Input value={multiEdit.notes || ""} onChange={(e) => setMultiEdit({ ...multiEdit, notes: e.target.value })} placeholder="Notes for all selected teeth..." className="h-9" />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" size="sm" onClick={() => setMultiEditOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={handleMultiSave} className="gap-1">
                Save All {selectedTeeth.size} Teeth
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Mobility grade picker for Quick Mark paint mode */}
      <Dialog open={mobilityPicker !== null} onOpenChange={(open) => !open && setMobilityPicker(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-sm">Select Mobility Grade</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Choose a grade for tooth #{mobilityPicker?.toothNumber}</p>
            <Select
              onValueChange={(v) => {
                if (!mobilityPicker) return;
                onSaveEntry({
                  tooth_number: mobilityPicker.toothNumber,
                  condition: "mobility",
                  mobility_grade: v as MobilityGrade,
                });
                setMobilityPicker(null);
              }}
            >
              <SelectTrigger className="h-9"><SelectValue placeholder="Select Grade" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="grade_1">Grade 1 - Slight</SelectItem>
                <SelectItem value="grade_2">Grade 2 - Moderate</SelectItem>
                <SelectItem value="grade_3">Grade 3 - Severe</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" onClick={() => setMobilityPicker(null)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
