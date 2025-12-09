"use client";
import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";
import { toast } from "sonner";

export function SignInForm() {
  const { signIn } = useAuthActions();
  const [flow, setFlow] = useState<"signIn" | "signUp">("signIn");
  const [submitting, setSubmitting] = useState(false);

  return (
    <div className="w-full">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitting(true);
          const formData = new FormData(e.target as HTMLFormElement);
          formData.set("flow", flow);
          void signIn("password", formData).catch((_error) => {
            const toastTitle =
              flow === "signIn"
                ? "Could not sign in. Please check your credentials."
                : "Could not sign up. That email may already be in use.";
            toast.error(toastTitle);
            setSubmitting(false);
          }).finally(() => {
            // setSubmitting(false) 
          });
        }}
      >
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Email</label>
          <input
            className="lumon-input"
            type="email"
            name="email"
            placeholder="you@example.com"
            required
            aria-label="Email"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Password</label>
          <input
            className="lumon-input"
            type="password"
            name="password"
            placeholder="••••••••"
            required
            aria-label="Password"
          />
        </div>
        <button className="auth-button" type="submit" disabled={submitting}>
          {submitting ? "Processing..." : (flow === "signIn" ? "Sign In" : "Create Account")}
        </button>
        <div className="text-center text-xs mt-2">
          <span className="text-slate-500 mr-1">
            {flow === "signIn"
              ? "Don't have an account?"
              : "Already have an account?"}
          </span>
          <button
            type="button"
            className="font-medium text-teal-700 hover:text-teal-900 hover:underline"
            onClick={() => setFlow(flow === "signIn" ? "signUp" : "signIn")}
          >
            {flow === "signIn" ? "Sign up" : "Sign in"}
          </button>
        </div>
      </form>

      <div className="flex items-center justify-center my-6 opacity-50">
        <div className="h-px bg-gray-300 w-full"></div>
        <span className="mx-3 text-[10px] text-slate-400 uppercase tracking-wide">or</span>
        <div className="h-px bg-gray-300 w-full"></div>
      </div>

      <button
        className="w-full py-2.5 border border-slate-400 text-slate-600 hover:bg-slate-100 hover:text-slate-800 transition-colors text-xs font-medium tracking-wide shadow-sm"
        style={{ borderRadius: '2px' }}
        onClick={() => void signIn("anonymous")}
        disabled={submitting}
      >
        Continue as Guest
      </button>
    </div>
  );
}