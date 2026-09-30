INSERT INTO public.callyzer_settings (
  environment,
  sandbox_base_url, production_base_url,
  sandbox_api_version, sandbox_history_path, sandbox_history_by_id_path, sandbox_daywise_path,
  production_api_version, production_history_path, production_history_by_id_path, production_daywise_path,
  is_enabled
)
SELECT
  'sandbox',
  'https://sandbox.api.callyzer.co', 'https://api1.callyzer.co',
  'v2.1', '/call-log/history', '/call-log/history-by-id', '/call-log/daywise-analytics',
  'v2.2', '/call-log/history', '/call-log/history-by-id', '/call-log/daywise-analytics',
  false
WHERE NOT EXISTS (SELECT 1 FROM public.callyzer_settings);

UPDATE public.callyzer_settings
SET sandbox_base_url = 'https://sandbox.api.callyzer.co',
    environment = 'sandbox',
    updated_at = now();