"use client";

import { useEffect, useState } from "react";
import { subscribeToPushNotifications, isPushEnabled } from "@/lib/push-notifications";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/i18n";

export default function PushNotificationPrompt() {
  const { t } = useT();
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
      <div className="py-3 flex items-center gap-2" style={{ borderTop: "1px solid rgb(var(--rgb-border))" }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgb(var(--rgb-moss))" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        <p className="font-body" style={{ fontSize: 15, color: "rgb(var(--rgb-text-secondary))" }}>{t("push.enabled")}</p>
      </div>
    );
  }

  if (!showPrompt) {
    return null;
  }

  return (
    <div className="py-3 flex items-center justify-between gap-3" style={{ borderTop: "1px solid rgb(var(--rgb-border))" }}>
      <p className="flex-1 font-body" style={{ fontSize: 15, lineHeight: 1.5, color: "rgb(var(--rgb-text-secondary))" }}>{t("push.get_alerts")}</p>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleDismiss}
          className="px-2 py-1.5 font-body uppercase font-bold"
          style={{ fontSize: 11, letterSpacing: "0.2em", color: "rgb(var(--rgb-text-muted))" }}
        >
          {t("common.dismiss")}
        </button>
        <button
          onClick={handleEnable}
          disabled={isLoading}
          className="font-body uppercase font-bold rounded-full transition-opacity disabled:opacity-50"
          style={{ fontSize: 11, letterSpacing: "0.2em", padding: "7px 14px", background: "transparent", border: "1px solid rgb(var(--rgb-border))", color: "rgb(var(--rgb-text-primary))" }}
        >
          {isLoading ? t("push.enabling") : t("push.enable")}
        </button>
      </div>
    </div>
  );
}
