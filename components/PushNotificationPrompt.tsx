"use client";

import { useEffect, useState } from "react";
import { subscribeToPushNotifications, isPushEnabled } from "@/lib/push-notifications";
import { useAuth } from "@/lib/auth-context";

export default function PushNotificationPrompt() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);
  const { token } = useAuth();

  useEffect(() => {
    // Check if push is already enabled
    const enabled = isPushEnabled();
    setIsEnabled(enabled);
    setShowPrompt(!enabled);
  }, []);

  const handleEnable = async () => {
    if (!token) return;
    
    setIsLoading(true);
    try {
      const success = await subscribeToPushNotifications(token);
      if (success) {
        setIsEnabled(true);
        setShowPrompt(false);
      }
    } catch (error) {
      console.error("Failed to enable push notifications:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
  };

  if (isEnabled) {
    return (
      <div className="px-4 py-3 rounded-xl border border-amber-sun/40 bg-amber-sun/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-amber-sun text-sm">✓</span>
          <p className="text-text-secondary text-sm font-body">Alerts enabled</p>
        </div>
      </div>
    );
  }

  if (!showPrompt) {
    return null;
  }

  return (
    <div className="px-4 py-3 rounded-xl border border-amber-sun/50 bg-forest-card/50 flex items-center justify-between gap-3">
      <div className="flex-1">
        <p className="text-text-secondary text-sm font-body">Get daily transit alerts</p>
      </div>
      <div className="flex gap-2 shrink-0">
        <button
          onClick={handleDismiss}
          className="px-3 py-1.5 text-text-secondary/60 text-xs font-body hover:text-text-secondary transition-colors"
        >
          Dismiss
        </button>
        <button
          onClick={handleEnable}
          disabled={isLoading}
          className="px-3 py-1.5 rounded-lg bg-amber-sun/20 text-amber-sun text-xs font-body font-medium hover:bg-amber-sun/30 transition-colors disabled:opacity-50"
        >
          {isLoading ? "Enabling..." : "Enable"}
        </button>
      </div>
    </div>
  );
}
