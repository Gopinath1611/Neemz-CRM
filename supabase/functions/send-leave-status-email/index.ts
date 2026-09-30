import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const body = await req.json().catch(() => null) as any;
    const to = typeof body?.to === 'string' ? body.to.trim() : '';
    const name = typeof body?.employee_name === 'string' ? body.employee_name.slice(0, 200) : 'Employee';
    const status = typeof body?.status === 'string' ? body.status.slice(0, 40) : 'Updated';
    const leaveType = typeof body?.leave_type === 'string' ? body.leave_type.slice(0, 60) : 'Leave';
    const range = typeof body?.date_range === 'string' ? body.date_range.slice(0, 60) : '';
    const days = body?.days == null ? null : Number(body.days);
    const approvedBy = typeof body?.approved_by === 'string' ? body.approved_by.slice(0, 80) : 'Admin';

    if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
      return json({ error: 'A valid recipient email is required' }, 400);
    }

    const host = Deno.env.get('SMTP_HOST');
    const port = Number(Deno.env.get('SMTP_PORT') || '465');
    const username = Deno.env.get('SMTP_USER');
    const password = Deno.env.get('SMTP_PASSWORD');
    const from = Deno.env.get('SMTP_FROM') || username;

    if (!host || !username || !password) {
      return json({ error: 'SMTP is not configured', skipped: true }, 503);
    }

    const dayText = days ? ` (${days} day${days === 1 ? '' : 's'})` : '';
    const subject = `Leave ${status} — ${leaveType} ${range}`;
    const text = `Dear ${name},\n\nYour ${leaveType} request for ${range}${dayText} has been ${status.toLowerCase()} by ${approvedBy}.\n\nRegards,\nHR, Dr Neemz Dentistry Pvt Ltd`;

    const client = new SMTPClient({
      connection: { hostname: host, port, tls: port !== 587, auth: { username, password } },
    });
    await client.send({
      from: from!,
      to,
      subject,
      content: text,
      html: `<p>Dear ${name},</p><p>Your <strong>${leaveType}</strong> request for <strong>${range}</strong>${dayText} has been <strong>${status}</strong> by ${approvedBy}.</p><p>Regards,<br/>HR, Dr Neemz Dentistry Pvt Ltd</p>`,
    });
    await client.close();

    return json({ success: true, to });
  } catch (e) {
    console.error('send-leave-status-email failed:', e);
    return json({ error: 'Failed to send leave status email', details: String((e as Error)?.message || e) }, 500);
  }
});
