"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import LoadingSpinner from "./LoadingSpinner";
import TrialBanner from "./TrialBanner";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !token) {
      router.push("/login");
    }
  }, [token, loading, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-forest-deep">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!token) return null;

  return (
    <>
      <TrialBanner />
      {children}
    </>
  );
}
