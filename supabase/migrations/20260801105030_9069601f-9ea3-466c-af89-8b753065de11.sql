UPDATE public.workflows
SET config = replace(config::text, '"google_review_request"', '"fl_checkout_google_review"')::jsonb,
    updated_at = now()
WHERE config::text LIKE '%"google_review_request"%';