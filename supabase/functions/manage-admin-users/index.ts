import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ADMIN_USERS_ACCESS_PATH = "/settings/clinic-admin-users";
const ROLE_OPTIONS = [
  "admin",
  "digital_marketing_manager",
  "digital_marketing_executive",
  "video_editor",
  "telecaller",
  "duty_doctor",
  "dental_assistant",
  "receptionist",
] as const;

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

    // Validate the bearer token explicitly (works even when the token is passed
    // as a raw JWT without a client session attached).
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const { data: userData, error: userError } = await adminClient.auth.getUser(token);
    const caller = userData?.user ?? null;

    if (!caller) {
      console.error("[manage-admin-users] unauthorized", userError?.message ?? "no user for token");
      return jsonResponse({ error: "Unauthorized", detail: userError?.message ?? "Invalid or expired session" }, 401);
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

    const body = req.method === "GET" ? {} : await req.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "list";

    if (action === "list") {
      const { data: roleRows, error: rolesError } = await adminClient
        .from("user_roles")
        .select("id, user_id, role");

      if (rolesError) {
        return jsonResponse({ error: rolesError.message }, 500);
      }

      const userIds = [...new Set((roleRows ?? []).map((row) => row.user_id))];
      if (userIds.length === 0) {
        return jsonResponse({ users: [] });
      }

      const [{ data: profileRows, error: profileError }, { data: authUsersData, error: authUsersError }] = await Promise.all([
        adminClient.from("profiles").select("id, full_name").in("id", userIds),
        adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      ]);

      if (profileError) {
        return jsonResponse({ error: profileError.message }, 500);
      }

      if (authUsersError) {
        return jsonResponse({ error: authUsersError.message }, 500);
      }

      const profileMap = new Map((profileRows ?? []).map((profile) => [profile.id, profile]));
      const emailMap = new Map((authUsersData?.users ?? []).map((user) => [user.id, user.email ?? ""]));
      const phoneMap = new Map((authUsersData?.users ?? []).map((user) => [user.id, user.phone ?? ""]));

      const users = (roleRows ?? [])
        .map((row) => ({
          id: row.id,
          user_id: row.user_id,
          role: row.role,
          full_name: profileMap.get(row.user_id)?.full_name ?? "",
          email: emailMap.get(row.user_id) ?? "",
          phone: phoneMap.get(row.user_id) ?? "",
        }))
        .sort((a, b) => (a.full_name || a.email).localeCompare(b.full_name || b.email));

      return jsonResponse({ users });
    }

    if (action === "update") {
      const userRoleId = typeof body.user_role_id === "string" ? body.user_role_id : "";
      const userId = typeof body.user_id === "string" ? body.user_id : "";
      const fullName = typeof body.full_name === "string" ? body.full_name.trim() : "";
      const role = typeof body.role === "string" ? body.role : "";

      if (!userRoleId || !userId || !ROLE_OPTIONS.includes(role as (typeof ROLE_OPTIONS)[number])) {
        return jsonResponse({ error: "Invalid update payload" }, 400);
      }

      if (fullName) {
        const { error: profileError } = await adminClient
          .from("profiles")
          .update({ full_name: fullName })
          .eq("id", userId);

        if (profileError) {
          return jsonResponse({ error: profileError.message }, 500);
        }
      }

      const { error: roleError } = await adminClient
        .from("user_roles")
        .update({ role })
        .eq("id", userRoleId);

      if (roleError) {
        return jsonResponse({ error: roleError.message }, 500);
      }

      return jsonResponse({ success: true });
    }

    if (action === "delete") {
      const userRoleId = typeof body.user_role_id === "string" ? body.user_role_id : "";
      if (!userRoleId) {
        return jsonResponse({ error: "Missing user role id" }, 400);
      }

      const { data: existingRole, error: existingRoleError } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("id", userRoleId)
        .maybeSingle();

      if (existingRoleError) {
        return jsonResponse({ error: existingRoleError.message }, 500);
      }

      if (existingRole?.role === "admin") {
        return jsonResponse({ error: "Admin role cannot be removed here" }, 400);
      }

      const { error: deleteError } = await adminClient
        .from("user_roles")
        .delete()
        .eq("id", userRoleId);

      if (deleteError) {
        return jsonResponse({ error: deleteError.message }, 500);
      }

      return jsonResponse({ success: true });
    }

    if (action === "update_contact") {
      const userId = typeof body.user_id === "string" ? body.user_id : "";
      const fullName = typeof body.full_name === "string" ? body.full_name.trim() : "";
      const email = typeof body.email === "string" ? body.email.trim() : "";
      const phone = typeof body.phone === "string" ? body.phone.trim() : "";

      if (!userId) {
        return jsonResponse({ error: "Missing user id" }, 400);
      }

      if (fullName) {
        const { error: profileError } = await adminClient
          .from("profiles")
          .update({ full_name: fullName })
          .eq("id", userId);
        if (profileError) {
          return jsonResponse({ error: profileError.message }, 500);
        }
      }

      const authAttrs: { email?: string; phone?: string } = {};
      if (email) authAttrs.email = email;
      if (phone) authAttrs.phone = phone;
      if (Object.keys(authAttrs).length > 0) {
        const { error: authErr } = await adminClient.auth.admin.updateUserById(userId, authAttrs);
        if (authErr) {
          return jsonResponse({ error: authErr.message }, 500);
        }
      }

      return jsonResponse({ success: true });
    }

    if (action === "reset_password") {
      const userId = typeof body.user_id === "string" ? body.user_id : "";
      const newPassword = typeof body.new_password === "string" ? body.new_password : "";
      if (!userId || newPassword.length < 8) {
        return jsonResponse({ error: "Password must be at least 8 characters" }, 400);
      }

      const { error: pwErr } = await adminClient.auth.admin.updateUserById(userId, {
        password: newPassword,
      });
      if (pwErr) {
        const msg = pwErr.message || "Could not update password";
        // Return password-policy failures as a handled response. The Functions client
        // otherwise replaces a non-2xx response body with a generic invocation error.
        const isWeak = /weak|easy to guess|pwned|leaked|password should|at least/i.test(msg);
        if (isWeak) {
          return jsonResponse({
            success: false,
            error: "That password is too weak or has appeared in a data breach. Use a longer password mixing upper/lowercase letters, numbers and symbols.",
            code: "weak_password",
          });
        }
        return jsonResponse({ error: msg }, 500);
      }
      return jsonResponse({ success: true });
    }


    if (action === "delete_user") {
      const userId = typeof body.user_id === "string" ? body.user_id : "";
      if (!userId) {
        return jsonResponse({ error: "Missing user id" }, 400);
      }

      if (userId === caller.id) {
        return jsonResponse({ error: "You cannot delete your own account" }, 400);
      }

      // Block deleting another admin
      const { data: targetRoles } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);

      if ((targetRoles ?? []).some((r) => r.role === "admin")) {
        return jsonResponse({ error: "Admin users cannot be deleted here" }, 400);
      }

      // Cascade: roles, module access, profile, then auth user
      await adminClient.from("user_roles").delete().eq("user_id", userId);
      await adminClient.from("user_module_access").delete().eq("user_id", userId);
      await adminClient.from("profiles").delete().eq("id", userId);

      const { error: authDeleteError } = await adminClient.auth.admin.deleteUser(userId);
      if (authDeleteError) {
        return jsonResponse({ error: authDeleteError.message }, 500);
      }

      return jsonResponse({ success: true });
    }

    return jsonResponse({ error: "Unsupported action" }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});