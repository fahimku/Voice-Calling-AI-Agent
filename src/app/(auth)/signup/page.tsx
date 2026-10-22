import { AuthForm } from "@/components/auth-form";

import { signup } from "../actions";

export default function SignupPage() {
  return (
    <AuthForm
      title="Create an account"
      description="Password must be at least 8 characters."
      action={signup}
      submitLabel="Sign up"
      alternateHref="/login"
      alternateLabel="Already have an account? Log in"
    />
  );
}
