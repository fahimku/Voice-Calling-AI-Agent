"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const credentialsSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export type AuthFormState = {
  error?: string;
  message?: string;
};

function readCredentials(formData: FormData) {
  const email = formData.get("email");
  const password = formData.get("password");

  return credentialsSchema.safeParse({
    email: typeof email === "string" ? email.trim() : "",
    password: typeof password === "string" ? password : "",
  });
}

export async function login(
  _state: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = readCredentials(formData);

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Check the form and try again.",
    };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword(parsed.data);

    if (error) {
      return { error: "Email or password is incorrect." };
    }
  } catch {
    return {
      error:
        "Could not sign in. Add the Supabase URL and publishable key to .env.local, then try again.",
    };
  }

  redirect("/dashboard");
}

export async function signup(
  _state: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = readCredentials(formData);

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Check the form and try again.",
    };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp(parsed.data);

    if (error) {
      const alreadyRegistered = /already registered|already been registered/i.test(
        error.message,
      );
      return {
        error: alreadyRegistered
          ? "An account with this email already exists. Log in instead."
          : "Could not create the account. Check the email and password, then try again.",
      };
    }

    if (!data.session) {
      return {
        message: "Check your email to confirm your account, then log in.",
      };
    }
  } catch {
    return {
      error:
        "Could not create the account. Add the Supabase URL and publishable key to .env.local, then try again.",
    };
  }

  redirect("/dashboard");
}

export async function logout() {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch {
    // Still leave the protected area if the auth client is unavailable.
  }

  redirect("/login");
}
