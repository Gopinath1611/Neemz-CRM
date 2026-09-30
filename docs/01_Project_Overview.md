# 01 — Project Overview

**Project:** Dr Neemz Dentistry — AI-powered Dental CRM
**Stack:** React 18 + Vite 5 + TypeScript + Tailwind v3 + shadcn-ui
**Backend:** Lovable Cloud (Postgres, Auth, Storage, Edge Functions, Realtime)
**Doc Version:** v2.0 · **Generated:** 2026-06-30

## Purpose
End-to-end practice management: appointments, clinic workflow, billing, finance, inventory, pharmacy, HR/payroll, FY planning, marketing, analytics.

## Top-level modules
| Module | Entry Point | Notes |
|---|---|---|
| Clinic Workflow | `src/pages/ClinicWorkflow.tsx` | Check-in → Consultation → Treatment → Payment |
| Finance | `src/pages/Finance.tsx` | KPI dashboard, expenses, deposits |
| Inventory | `src/pages/Inventory.tsx` | Branch-scoped stock |
| Purchases | `src/pages/Purchases.tsx` | Vendor invoices, auto-expense |
| Pharmacy | `src/pages/Pharmacy.tsx` | Medicine dispensing |
| HRMS | `src/pages/HRMSHome.tsx` | Employees, attendance, leave, payroll |
| FY Planning | `src/pages/fy/*` | Targets vs actuals |
| Analytics | `src/pages/Analytics.tsx` | Cross-module reports |
| System Documentation | `src/pages/SystemDocumentation.tsx` | This doc viewer |

## Documentation index
See `docs/` folder. Entry doc: `01_Project_Overview.md`. Master finance reference: `05_Finance_Architecture.md` (v2.0, 18 sections, supersedes v1.0).

## How to regenerate
See `05_Finance_Architecture.md` §19 and `11_Release_Notes.md`.
