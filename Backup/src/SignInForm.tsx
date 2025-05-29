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
                ? "Could not sign in. Check credentials or sign up."
                : "Could not sign up. Maybe that email is taken?";
            toast.error(toastTitle);
            setSubmitting(false);
          }).finally(() => {
            // setSubmitting(false) is called in catch, ensure it's also called on success if signIn doesn't navigate away
            // For password auth, it usually implies a session change which re-renders, so explicit false might not always be needed.
            // However, if there's a scenario where it doesn't re-render immediately:
            // if (flow === "signUp") setSubmitting(false); // Or always set it if UI doesn't change fast enough
          });
        }}
      >
        <input
          className="input-field"
          type="email"
          name="email"
          placeholder="Email"
          required
          aria-label="Email"
        />
        <input
          className="input-field"
          type="password"
          name="password"
          placeholder="Password"
          required
          aria-label="Password"
        />
        <button className="auth-button" type="submit" disabled={submitting}>
          {submitting ? (flow === "signIn" ? "Signing in..." : "Signing up...") : (flow === "signIn" ? "Sign in" : "Sign up")}
        </button>
        <div className="text-center text-sm text-slate-600">
          <span>
            {flow === "signIn"
              ? "Don't have an account? "
              : "Already have an account? "}
          </span>
          <button
            type="button"
            className="link-text"
            onClick={() => setFlow(flow === "signIn" ? "signUp" : "signIn")}
          >
            {flow === "signIn" ? "Sign up instead" : "Sign in instead"}
          </button>
        </div>
      </form>
      <div className="flex items-center justify-center my-4"> {/* Adjusted margin */}
        <hr className="my-4 grow border-slate-200" /> {/* Styled hr */}
        <span className="mx-4 text-slate-400 text-sm">or</span>
        <hr className="my-4 grow border-slate-200" /> {/* Styled hr */}
      </div>
      <button 
        className="auth-button bg-slate-600 hover:bg-slate-700" // Different style for anonymous
        onClick={() => void signIn("anonymous")}
        disabled={submitting}
      >
        Sign in anonymously
      </button>
    </div>
  );
}