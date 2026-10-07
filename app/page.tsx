"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import LoadingSpinner from "@/components/LoadingSpinner";

export default function Home() {
  const { token, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      // replace, not push: "/" is only a doorway. With push, Android Back
      // from Now returned here and was pushed straight back to Now, a loop
      // the member could not leave.
      if (token) {
        router.replace("/today");
      } else {
        router.replace("/login");
      }
    }
  }, [token, loading, router]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-forest-deep">
      <LoadingSpinner size="lg" />
    </div>
  );
}
// Rebuild trigger Tue Apr 14 18:26:12 CEST 2026
