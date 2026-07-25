"use client";

import { useSession } from "next-auth/react";

export interface AuthUser {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  instrument?: string | null;
}

export interface UseAuthResult {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export function useAuth(): UseAuthResult {
  const { data: session, status } = useSession();

  return {
    user: (session?.user as AuthUser | undefined) ?? null,
    isAuthenticated: status === "authenticated",
    isLoading: status === "loading",
  };
}
