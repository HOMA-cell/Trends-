import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const authorization = req.headers.get("Authorization") || "";
  const accessToken = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !accessToken) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: { confirmation?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }
  if (body.confirmation !== "DELETE") {
    return json({ error: "Confirmation did not match" }, 400);
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await authClient.auth.getUser(accessToken);
  const user = userData.user;
  if (userError || !user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const cleanupWarnings: string[] = [];

  const listFolderFiles = async (bucket: string, folder: string) => {
    const paths: string[] = [];
    let offset = 0;

    while (true) {
      const { data, error } = await admin.storage.from(bucket).list(folder, {
        limit: 1000,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) {
        cleanupWarnings.push(`${bucket}: ${error.message}`);
        return paths;
      }
      const page = data || [];
      paths.push(
        ...page
          .filter((item) => item.id)
          .map((item) => `${folder}/${item.name}`),
      );
      if (page.length < 1000) break;
      offset += page.length;
    }

    return paths;
  };

  const removeStoragePaths = async (bucket: string, paths: string[]) => {
    for (let index = 0; index < paths.length; index += 100) {
      const { error: removeError } = await admin.storage
        .from(bucket)
        .remove(paths.slice(index, index + 100));
      if (removeError) {
        cleanupWarnings.push(`${bucket}: ${removeError.message}`);
        return;
      }
    }
  };

  const [avatarPaths, postMediaPaths] = await Promise.all([
    listFolderFiles("avatars", `public/${user.id}`),
    listFolderFiles("post-media", `public/${user.id}`),
  ]);

  const { data: sentMedia, error: sentError } = await admin
    .from("direct_messages")
    .select("media_path")
    .eq("sender_id", user.id)
    .not("media_path", "is", null);
  const { data: receivedMedia, error: receivedError } = await admin
    .from("direct_messages")
    .select("media_path")
    .eq("recipient_id", user.id)
    .not("media_path", "is", null);
  if (sentError) cleanupWarnings.push(`dm-media: ${sentError.message}`);
  if (receivedError) cleanupWarnings.push(`dm-media: ${receivedError.message}`);

  const dmPaths = Array.from(
    new Set(
      [...(sentMedia || []), ...(receivedMedia || [])]
        .map((row) => `${row.media_path || ""}`.trim())
        .filter(Boolean),
    ),
  );
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    return json({ error: deleteError.message }, 500);
  }

  await Promise.all([
    removeStoragePaths("avatars", avatarPaths),
    removeStoragePaths("post-media", postMediaPaths),
    removeStoragePaths("dm-media", dmPaths),
  ]);

  return json({ deleted: true, cleanupWarnings });
});
