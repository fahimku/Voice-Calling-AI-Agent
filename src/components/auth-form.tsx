"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import type { AuthFormState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AuthFormProps = {
  title: string;
  description: string;
  action: (state: AuthFormState, formData: FormData) => Promise<AuthFormState>;
  submitLabel: string;
  alternateHref: string;
  alternateLabel: string;
};

export function AuthForm({
  title,
  description,
  action,
  submitLabel,
  alternateHref,
  alternateLabel,
}: AuthFormProps) {
  const [state, formAction, pending] = useActionState(action, {});
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Calling Agent
        </p>
        <CardTitle className="text-xl">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-10"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete={
                submitLabel === "Sign up" ? "new-password" : "current-password"
              }
              minLength={8}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-10"
            />
          </div>
          {state.error ? (
            <p className="text-sm text-destructive" role="alert">
              {state.error}
            </p>
          ) : null}
          {state.message ? (
            <p className="text-sm text-muted-foreground" role="status">
              {state.message}
            </p>
          ) : null}
          <Button type="submit" size="lg" disabled={pending} className="w-full">
            {pending ? "Please wait…" : submitLabel}
          </Button>
        </form>
        <p className="mt-4 text-sm text-muted-foreground">
          <Link href={alternateHref} className="font-medium text-foreground underline-offset-4 hover:underline">
            {alternateLabel}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
