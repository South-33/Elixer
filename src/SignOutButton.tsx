"use client";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";

// Placeholder Logout Icon
const LogoutIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path>
  </svg>
);


export function SignOutButton() {
  const { isAuthenticated } = useConvexAuth();
  const { signOut } = useAuthActions();

  if (!isAuthenticated) {
    return null;
  }

  return (
    <button
      className="flex items-center gap-2 px-3 py-2 rounded-md transition-colors bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-700 text-sm font-medium"
      onClick={() => void signOut()}
      title="Sign Out"
    >
      <LogoutIcon />
      <span className="hidden sm:inline">Sign out</span>
      <span className="sr-only">Sign out</span>
    </button>
  );
}