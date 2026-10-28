import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabasePublicEnv } from "@/lib/env";

const PUBLIC_PATHS = new Set(["/login", "/signup", "/api/scheduler/tick", "/api/webhooks/vapi"]);

function isRecordingPath(path: string) {
  return /^\/api\/calls\/[^/]+\/recording$/.test(path);
}

export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.has(path);
  const env = getSupabasePublicEnv();

  if (!env) {
    if (isRecordingPath(path)) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    if (isPublic) {
      return NextResponse.next({ request });
    }

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    return NextResponse.redirect(loginUrl);
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
        Object.entries(headers).forEach(([key, value]) => {
          supabaseResponse.headers.set(key, value);
        });
      },
    },
  });

  // Refresh the session before any other auth decision.
  const { data } = await supabase.auth.getClaims();
  const isAuthenticated = Boolean(data?.claims);

  if (!isAuthenticated && isRecordingPath(path)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!isAuthenticated && !isPublic) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    return withSession(NextResponse.redirect(loginUrl), supabaseResponse);
  }

  if (isAuthenticated && isPublic && !path.startsWith("/api/")) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    dashboardUrl.search = "";
    return withSession(NextResponse.redirect(dashboardUrl), supabaseResponse);
  }

  return supabaseResponse;
}

function withSession(response: NextResponse, supabaseResponse: NextResponse) {
  supabaseResponse.cookies.getAll().forEach((cookie) => {
    response.cookies.set(cookie);
  });

  for (const header of ["cache-control", "expires", "pragma"]) {
    const value = supabaseResponse.headers.get(header);
    if (value) {
      response.headers.set(header, value);
    }
  }

  return response;
}
