import { AuthForm } from "@/components/auth-form";

import { login } from "../actions";

export default function LoginPage() {
  return (
    <AuthForm
      title="Log in"
      description="Use the email and password for your account."
      action={login}
      submitLabel="Log in"
      alternateHref="/signup"
      alternateLabel="Need an account? Sign up"
    />
  );
}
