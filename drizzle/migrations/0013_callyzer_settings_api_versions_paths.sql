ALTER TABLE public.callyzer_settings
  ADD COLUMN IF NOT EXISTS sandbox_api_version text NOT NULL DEFAULT 'v2.1',
  ADD COLUMN IF NOT EXISTS sandbox_history_path text NOT NULL DEFAULT '/call-log/history',
  ADD COLUMN IF NOT EXISTS sandbox_history_by_id_path text NOT NULL DEFAULT '/call-log/history-by-id',
  ADD COLUMN IF NOT EXISTS sandbox_daywise_path text NOT NULL DEFAULT '/call-log/daywise-analytics',
  ADD COLUMN IF NOT EXISTS production_api_version text NOT NULL DEFAULT 'v2.2',
  ADD COLUMN IF NOT EXISTS production_history_path text NOT NULL DEFAULT '/call-log/history',
  ADD COLUMN IF NOT EXISTS production_history_by_id_path text NOT NULL DEFAULT '/call-log/history-by-id',
  ADD COLUMN IF NOT EXISTS production_daywise_path text NOT NULL DEFAULT '/call-log/daywise-analytics';

UPDATE public.callyzer_settings
SET sandbox_base_url = 'https://sandbox.api.callyzer.co',
    environment = 'sandbox',
    updated_at = now();