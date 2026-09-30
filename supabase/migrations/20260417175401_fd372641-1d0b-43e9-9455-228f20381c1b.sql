-- Helper function: check if user is admin or finance_manager
CREATE OR REPLACE FUNCTION public.is_finance_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id 
      AND role IN ('admin'::app_role, 'finance_manager'::app_role)
  )
$$;

-- TABLE 1: fy_master_plan
CREATE TABLE public.fy_master_plan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  financial_year text NOT NULL,
  branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  total_revenue_target numeric NOT NULL DEFAULT 0,
  op_revenue_target numeric NOT NULL DEFAULT 0,
  implant_revenue_target numeric NOT NULL DEFAULT 0,
  ortho_revenue_target numeric NOT NULL DEFAULT 0,
  cosmetic_revenue_target numeric NOT NULL DEFAULT 0,
  general_dentistry_target numeric NOT NULL DEFAULT 0,
  total_patient_target integer NOT NULL DEFAULT 0,
  new_patient_target integer NOT NULL DEFAULT 0,
  recall_patient_target integer NOT NULL DEFAULT 0,
  chair_utilization_target numeric NOT NULL DEFAULT 0,
  case_acceptance_target numeric NOT NULL DEFAULT 0,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(financial_year, branch_id)
);
ALTER TABLE public.fy_master_plan ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Finance users manage master plan" ON public.fy_master_plan
  FOR ALL TO authenticated
  USING (public.is_finance_user(auth.uid()))
  WITH CHECK (public.is_finance_user(auth.uid()));
CREATE TRIGGER trg_fy_master_plan_updated BEFORE UPDATE ON public.fy_master_plan
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- TABLE 2: fy_monthly_targets
CREATE TABLE public.fy_monthly_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  financial_year text NOT NULL,
  branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  revenue_target numeric NOT NULL DEFAULT 0,
  patient_target integer NOT NULL DEFAULT 0,
  implant_target integer NOT NULL DEFAULT 0,
  ortho_target integer NOT NULL DEFAULT 0,
  cosmetic_target integer NOT NULL DEFAULT 0,
  recall_target integer NOT NULL DEFAULT 0,
  marketing_budget numeric NOT NULL DEFAULT 0,
  salary_budget numeric NOT NULL DEFAULT 0,
  operational_cost_budget numeric NOT NULL DEFAULT 0,
  net_profit_target numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(financial_year, branch_id, month)
);
ALTER TABLE public.fy_monthly_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Finance users manage monthly targets" ON public.fy_monthly_targets
  FOR ALL TO authenticated
  USING (public.is_finance_user(auth.uid()))
  WITH CHECK (public.is_finance_user(auth.uid()));
CREATE TRIGGER trg_fy_monthly_targets_updated BEFORE UPDATE ON public.fy_monthly_targets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- TABLE 3: fy_actual_tracking
CREATE TABLE public.fy_actual_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL DEFAULT CURRENT_DATE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  financial_year text NOT NULL,
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  actual_revenue numeric NOT NULL DEFAULT 0,
  actual_patients integer NOT NULL DEFAULT 0,
  actual_implants integer NOT NULL DEFAULT 0,
  actual_ortho_cases integer NOT NULL DEFAULT 0,
  actual_cosmetic_cases integer NOT NULL DEFAULT 0,
  actual_recall_patients integer NOT NULL DEFAULT 0,
  actual_marketing_spend numeric NOT NULL DEFAULT 0,
  actual_salary_spend numeric NOT NULL DEFAULT 0,
  actual_expense numeric NOT NULL DEFAULT 0,
  actual_profit numeric NOT NULL DEFAULT 0,
  is_manual_override boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(branch_id, financial_year, month)
);
ALTER TABLE public.fy_actual_tracking ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Finance users manage actual tracking" ON public.fy_actual_tracking
  FOR ALL TO authenticated
  USING (public.is_finance_user(auth.uid()))
  WITH CHECK (public.is_finance_user(auth.uid()));
CREATE TRIGGER trg_fy_actual_tracking_updated BEFORE UPDATE ON public.fy_actual_tracking
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- TABLE 4: fy_variance_tracker
CREATE TABLE public.fy_variance_tracker (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  financial_year text NOT NULL,
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  revenue_target numeric NOT NULL DEFAULT 0,
  revenue_actual numeric NOT NULL DEFAULT 0,
  revenue_variance numeric NOT NULL DEFAULT 0,
  patient_target integer NOT NULL DEFAULT 0,
  patient_actual integer NOT NULL DEFAULT 0,
  patient_variance integer NOT NULL DEFAULT 0,
  profit_target numeric NOT NULL DEFAULT 0,
  profit_actual numeric NOT NULL DEFAULT 0,
  profit_variance numeric NOT NULL DEFAULT 0,
  variance_status text NOT NULL DEFAULT 'green',
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(branch_id, financial_year, month)
);
ALTER TABLE public.fy_variance_tracker ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Finance users manage variance" ON public.fy_variance_tracker
  FOR ALL TO authenticated
  USING (public.is_finance_user(auth.uid()))
  WITH CHECK (public.is_finance_user(auth.uid()));

-- TABLE 5: department_projection_targets
CREATE TABLE public.department_projection_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  financial_year text NOT NULL,
  branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  department_name text NOT NULL,
  monthly_target numeric NOT NULL DEFAULT 0,
  quarterly_target numeric NOT NULL DEFAULT 0,
  yearly_target numeric NOT NULL DEFAULT 0,
  conversion_target numeric NOT NULL DEFAULT 0,
  avg_case_value_target numeric NOT NULL DEFAULT 0,
  responsible_staff text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(financial_year, branch_id, department_name)
);
ALTER TABLE public.department_projection_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Finance users manage dept targets" ON public.department_projection_targets
  FOR ALL TO authenticated
  USING (public.is_finance_user(auth.uid()))
  WITH CHECK (public.is_finance_user(auth.uid()));
CREATE TRIGGER trg_dept_projection_updated BEFORE UPDATE ON public.department_projection_targets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- TABLE 6: chair_utilization_projection
CREATE TABLE public.chair_utilization_projection (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  financial_year text NOT NULL,
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  total_chairs integer NOT NULL DEFAULT 1,
  working_hours_per_day numeric NOT NULL DEFAULT 8,
  working_days integer NOT NULL DEFAULT 26,
  available_hours numeric GENERATED ALWAYS AS (total_chairs * working_hours_per_day * working_days) STORED,
  target_utilization_percent numeric NOT NULL DEFAULT 70,
  expected_patient_load integer NOT NULL DEFAULT 0,
  expected_revenue_per_chair numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(branch_id, financial_year, month)
);
ALTER TABLE public.chair_utilization_projection ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Finance users manage chair projection" ON public.chair_utilization_projection
  FOR ALL TO authenticated
  USING (public.is_finance_user(auth.uid()))
  WITH CHECK (public.is_finance_user(auth.uid()));
CREATE TRIGGER trg_chair_projection_updated BEFORE UPDATE ON public.chair_utilization_projection
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- TABLE 7: staff_projection_targets
CREATE TABLE public.staff_projection_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  financial_year text NOT NULL,
  staff_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'doctor',
  monthly_revenue_target numeric NOT NULL DEFAULT 0,
  conversion_target numeric NOT NULL DEFAULT 0,
  patient_handling_target integer NOT NULL DEFAULT 0,
  recall_target integer NOT NULL DEFAULT 0,
  performance_score_target numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(financial_year, staff_id)
);
ALTER TABLE public.staff_projection_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Finance users manage staff projection" ON public.staff_projection_targets
  FOR ALL TO authenticated
  USING (public.is_finance_user(auth.uid()))
  WITH CHECK (public.is_finance_user(auth.uid()));
CREATE TRIGGER trg_staff_projection_updated BEFORE UPDATE ON public.staff_projection_targets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- TABLE 8: marketing_projection_plan
CREATE TABLE public.marketing_projection_plan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  financial_year text NOT NULL,
  branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  campaign_name text NOT NULL,
  channel text NOT NULL DEFAULT 'meta_ads',
  lead_target integer NOT NULL DEFAULT 0,
  patient_target integer NOT NULL DEFAULT 0,
  budget_allocated numeric NOT NULL DEFAULT 0,
  expected_revenue numeric NOT NULL DEFAULT 0,
  expected_roi_percent numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.marketing_projection_plan ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Finance users manage marketing projection" ON public.marketing_projection_plan
  FOR ALL TO authenticated
  USING (public.is_finance_user(auth.uid()))
  WITH CHECK (public.is_finance_user(auth.uid()));
CREATE TRIGGER trg_mkt_projection_updated BEFORE UPDATE ON public.marketing_projection_plan
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- TABLE 9: branch_expansion_plan
CREATE TABLE public.branch_expansion_plan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  financial_year text NOT NULL,
  new_branch_name text NOT NULL,
  launch_month integer NOT NULL CHECK (launch_month BETWEEN 1 AND 12),
  chairs_planned integer NOT NULL DEFAULT 1,
  investment_required numeric NOT NULL DEFAULT 0,
  expected_monthly_revenue numeric NOT NULL DEFAULT 0,
  break_even_month integer,
  expected_roi numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'planned',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.branch_expansion_plan ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Finance users manage expansion plan" ON public.branch_expansion_plan
  FOR ALL TO authenticated
  USING (public.is_finance_user(auth.uid()))
  WITH CHECK (public.is_finance_user(auth.uid()));
CREATE TRIGGER trg_expansion_updated BEFORE UPDATE ON public.branch_expansion_plan
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- TABLE 10: profit_projection_summary
CREATE TABLE public.profit_projection_summary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  financial_year text NOT NULL,
  branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  total_revenue_target numeric NOT NULL DEFAULT 0,
  total_expense_target numeric NOT NULL DEFAULT 0,
  salary_expense_target numeric NOT NULL DEFAULT 0,
  marketing_expense_target numeric NOT NULL DEFAULT 0,
  operational_expense_target numeric NOT NULL DEFAULT 0,
  net_profit_target numeric NOT NULL DEFAULT 0,
  profit_margin_target numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(financial_year, branch_id)
);
ALTER TABLE public.profit_projection_summary ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Finance users manage profit summary" ON public.profit_projection_summary
  FOR ALL TO authenticated
  USING (public.is_finance_user(auth.uid()))
  WITH CHECK (public.is_finance_user(auth.uid()));
CREATE TRIGGER trg_profit_summary_updated BEFORE UPDATE ON public.profit_projection_summary
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- AUTO-SYNC FUNCTION
CREATE OR REPLACE FUNCTION public.recompute_fy_actuals(
  p_branch_id uuid,
  p_financial_year text,
  p_month integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year_start integer;
  v_actual_year integer;
  v_month_start date;
  v_month_end date;
  v_revenue numeric := 0;
  v_patients integer := 0;
  v_marketing numeric := 0;
  v_salary numeric := 0;
  v_total_expense numeric := 0;
  v_profit numeric := 0;
  v_existing_override boolean := false;
BEGIN
  v_year_start := substring(p_financial_year FROM 1 FOR 4)::integer;
  IF p_month >= 4 THEN
    v_actual_year := v_year_start;
  ELSE
    v_actual_year := v_year_start + 1;
  END IF;
  v_month_start := make_date(v_actual_year, p_month, 1);
  v_month_end := (v_month_start + interval '1 month' - interval '1 day')::date;

  SELECT COALESCE(SUM(total_amount), 0), COALESCE(COUNT(DISTINCT patient_id), 0)
    INTO v_revenue, v_patients
    FROM public.billings
   WHERE created_at::date BETWEEN v_month_start AND v_month_end;

  SELECT 
    COALESCE(SUM(CASE WHEN lower(category) LIKE '%marketing%' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN lower(category) IN ('salary','salaries','payroll') THEN amount ELSE 0 END), 0),
    COALESCE(SUM(amount), 0)
  INTO v_marketing, v_salary, v_total_expense
  FROM public.expenses
  WHERE expense_date BETWEEN v_month_start AND v_month_end;

  v_profit := v_revenue - v_total_expense;

  SELECT is_manual_override INTO v_existing_override
    FROM public.fy_actual_tracking
    WHERE branch_id IS NOT DISTINCT FROM p_branch_id 
      AND financial_year = p_financial_year AND month = p_month;

  INSERT INTO public.fy_actual_tracking (
    date, branch_id, financial_year, month,
    actual_revenue, actual_patients,
    actual_marketing_spend, actual_salary_spend, actual_expense, actual_profit
  )
  VALUES (
    v_month_end, p_branch_id, p_financial_year, p_month,
    v_revenue, v_patients,
    v_marketing, v_salary, v_total_expense, v_profit
  )
  ON CONFLICT (branch_id, financial_year, month) DO UPDATE SET
    actual_revenue = CASE WHEN public.fy_actual_tracking.is_manual_override THEN public.fy_actual_tracking.actual_revenue ELSE EXCLUDED.actual_revenue END,
    actual_patients = CASE WHEN public.fy_actual_tracking.is_manual_override THEN public.fy_actual_tracking.actual_patients ELSE EXCLUDED.actual_patients END,
    actual_marketing_spend = CASE WHEN public.fy_actual_tracking.is_manual_override THEN public.fy_actual_tracking.actual_marketing_spend ELSE EXCLUDED.actual_marketing_spend END,
    actual_salary_spend = CASE WHEN public.fy_actual_tracking.is_manual_override THEN public.fy_actual_tracking.actual_salary_spend ELSE EXCLUDED.actual_salary_spend END,
    actual_expense = CASE WHEN public.fy_actual_tracking.is_manual_override THEN public.fy_actual_tracking.actual_expense ELSE EXCLUDED.actual_expense END,
    actual_profit = CASE WHEN public.fy_actual_tracking.is_manual_override THEN public.fy_actual_tracking.actual_profit ELSE EXCLUDED.actual_profit END,
    updated_at = now();

  -- Recompute variance
  INSERT INTO public.fy_variance_tracker (
    branch_id, financial_year, month,
    revenue_target, revenue_actual, revenue_variance,
    patient_target, patient_actual, patient_variance,
    profit_target, profit_actual, profit_variance,
    variance_status
  )
  SELECT 
    p_branch_id, p_financial_year, p_month,
    COALESCE(t.revenue_target, 0), v_revenue, v_revenue - COALESCE(t.revenue_target, 0),
    COALESCE(t.patient_target, 0), v_patients, v_patients - COALESCE(t.patient_target, 0),
    COALESCE(t.net_profit_target, 0), v_profit, v_profit - COALESCE(t.net_profit_target, 0),
    CASE 
      WHEN COALESCE(t.revenue_target, 0) = 0 THEN 'green'
      WHEN v_revenue >= t.revenue_target THEN 'green'
      WHEN v_revenue >= t.revenue_target * 0.9 THEN 'yellow'
      ELSE 'red'
    END
  FROM (SELECT revenue_target, patient_target, net_profit_target 
        FROM public.fy_monthly_targets 
        WHERE financial_year = p_financial_year AND month = p_month 
          AND branch_id IS NOT DISTINCT FROM p_branch_id
        LIMIT 1) t
  ON CONFLICT (branch_id, financial_year, month) DO UPDATE SET
    revenue_target = EXCLUDED.revenue_target,
    revenue_actual = EXCLUDED.revenue_actual,
    revenue_variance = EXCLUDED.revenue_variance,
    patient_target = EXCLUDED.patient_target,
    patient_actual = EXCLUDED.patient_actual,
    patient_variance = EXCLUDED.patient_variance,
    profit_target = EXCLUDED.profit_target,
    profit_actual = EXCLUDED.profit_actual,
    profit_variance = EXCLUDED.profit_variance,
    variance_status = EXCLUDED.variance_status,
    computed_at = now();
END;
$$;