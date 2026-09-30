import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ADMIN_USERS_ACCESS_PATH = "/settings/clinic-admin-users";

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Missing authorization" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const {
      data: { user: caller },
    } = await callerClient.auth.getUser();

    if (!caller) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const [{ data: adminRole }, { data: moduleAccess }] = await Promise.all([
      callerClient
        .from("user_roles")
        .select("role")
        .eq("user_id", caller.id)
        .eq("role", "admin")
        .maybeSingle(),
      callerClient
        .from("user_module_access")
        .select("has_access")
        .eq("user_id", caller.id)
        .eq("module_path", ADMIN_USERS_ACCESS_PATH)
        .eq("has_access", true)
        .maybeSingle(),
    ]);

    if (!adminRole && !moduleAccess) {
      return jsonResponse({ error: "Access denied" }, 403);
    }

    const { email, password, full_name, role } = await req.json();

    if (!email || !password || !full_name || !role) {
      return jsonResponse({ error: "Missing required fields" }, 400);
    }

    let userId: string | null = null;
    let reused = false;

    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });

    if (createError) {
      const msg = createError.message || "";
      const alreadyExists = /already|registered|exists/i.test(msg);
      if (!alreadyExists) {
        // Password-policy failures must come back as a handled 200 response, otherwise the
        // Functions client replaces the body with a generic invocation error.
        const isWeak = /weak|easy to guess|pwned|leaked|password should|at least/i.test(msg);
        if (isWeak) {
          return jsonResponse({
            success: false,
            code: "weak_password",
            error:
              "That password is too weak or has appeared in a data breach. Use at least 8 characters mixing upper/lowercase letters, numbers and symbols.",
          });
        }
        return jsonResponse({ error: msg }, 400);
      }
      // Look up existing user by email
      const { data: list, error: listErr } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (listErr) {
        return jsonResponse({ error: listErr.message }, 500);
      }
      const existing = list.users.find((u) => (u.email || "").toLowerCase() === email.toLowerCase());
      if (!existing) {
        return jsonResponse({ error: msg }, 400);
      }
      userId = existing.id;
      reused = true;
      // Update password + name
      await adminClient.auth.admin.updateUserById(userId, {
        password,
        user_metadata: { full_name },
      });
      await adminClient.from("profiles").update({ full_name }).eq("id", userId);
    } else {
      userId = newUser.user.id;
    }

    // Check if role already assigned to avoid duplicate
    const { data: existingRole } = await adminClient
      .from("user_roles")
      .select("id")
      .eq("user_id", userId!)
      .eq("role", role)
      .maybeSingle();

    let roleError: { message: string } | null = null;
    if (!existingRole) {
      const { error } = await adminClient.from("user_roles").insert({
        user_id: userId,
        role,
      });
      roleError = error;
    }

    return jsonResponse({
      success: true,
      user_id: userId,
      reused_existing: reused,
      role_error: roleError?.message || null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});
