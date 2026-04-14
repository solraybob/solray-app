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
      if (token) {
        router.push("/today");
      } else {
        router.push("/login");
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
