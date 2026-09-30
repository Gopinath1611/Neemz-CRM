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
    const employeeName = typeof body?.employeeName === 'string' ? body.employeeName.slice(0, 200) : 'Employee';
    const period = typeof body?.period === 'string' ? body.period.slice(0, 40) : '';
    const netSalary = Number(body?.netSalary || 0);
    const fileName = typeof body?.fileName === 'string' ? body.fileName.slice(0, 200) : 'payslip.pdf';
    const pdfBase64 = typeof body?.pdfBase64 === 'string' ? body.pdfBase64 : '';

    if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
      return json({ error: 'A valid recipient email is required' }, 400);
    }
    if (!pdfBase64) return json({ error: 'pdfBase64 is required' }, 400);

    const host = Deno.env.get('SMTP_HOST');
    const port = Number(Deno.env.get('SMTP_PORT') || '465');
    const username = Deno.env.get('SMTP_USER');
    const password = Deno.env.get('SMTP_PASSWORD');
    const from = Deno.env.get('SMTP_FROM') || username;

    if (!host || !username || !password) {
      // 200 with success:false so the app shows a friendly message instead of crashing.
      return json({
        success: false,
        code: 'smtp_not_configured',
        error: 'Payslip email is not set up yet — the clinic mail account details need to be added first.',
      }, 200);
    }

    const client = new SMTPClient({
      connection: { hostname: host, port, tls: port !== 587, auth: { username, password } },
    });

    await client.send({
      from: from!,
      to,
      subject: `Payslip - ${period}`,
      content: `Dear ${employeeName},\n\nPlease find attached your payslip for ${period}.\nNet Salary: Rs. ${netSalary.toLocaleString('en-IN')}\n\nRegards,\nHR, Dr Neemz Dentistry Pvt Ltd`,
      html: `<p>Dear ${employeeName},</p><p>Please find attached your payslip for <strong>${period}</strong>.</p><p>Net Salary: <strong>Rs. ${netSalary.toLocaleString('en-IN')}</strong></p><p>Regards,<br/>HR, Dr Neemz Dentistry Pvt Ltd</p>`,
      attachments: [{
        filename: fileName,
        contentType: 'application/pdf',
        encoding: 'base64',
        content: pdfBase64,
      }],
    });
    await client.close();

    return json({ success: true, to });
  } catch (e) {
    console.error('send-payslip-email failed:', e);
    return json({ error: 'Failed to send payslip email', details: String((e as Error)?.message || e) }, 500);
  }
});
