UPDATE public.connected_apps
SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
  'meta_app_id', '1436600324896173',
  'waba_id', '1303942691475826',
  'phone_number_id', '777081605497413',
  'system_user_name', 'Denzo'
)
WHERE platform = 'WhatsApp Business API';