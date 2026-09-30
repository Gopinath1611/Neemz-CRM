ALTER TABLE public.role_metrics REPLICA IDENTITY FULL;
ALTER TABLE public.role_target_kinds REPLICA IDENTITY FULL;
ALTER TABLE public.role_target_kind_overrides REPLICA IDENTITY FULL;
ALTER TABLE public.role_hidden_presets REPLICA IDENTITY FULL;
ALTER TABLE public.employee_targets REPLICA IDENTITY FULL;
ALTER TABLE public.department_roles REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.role_metrics;
ALTER PUBLICATION supabase_realtime ADD TABLE public.role_target_kinds;
ALTER PUBLICATION supabase_realtime ADD TABLE public.role_target_kind_overrides;
ALTER PUBLICATION supabase_realtime ADD TABLE public.role_hidden_presets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.employee_targets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.department_roles;