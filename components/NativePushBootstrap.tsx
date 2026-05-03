"use client";

/**
 * NativePushBootstrap
 *
 * Mounts inside the AuthProvider tree. When the user is authenticated
 * AND we're running inside the Capacitor native shell (iOS or Android),
 * this kicks off:
 *
 *   1. registerNativePush(token), request system permission, get
 *                                        APNs/FCM token, post to backend
 *   2. attachNativePushHandlers(), listen for taps on incoming
 *                                        pushes so we can route the user
 *                                        to the right screen
 *
 * On the web, this component is a no-op, the helpers themselves
 * short-circuit when isRunningInCapacitor() returns false.
 *
 * Safe to mount once at the root layout. The registration helper is
 * idempotent (uses a localStorage flag) so we never spam the backend.
 */

import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  registerNativePush,
  attachNativePushHandlers,
  isRunningInCapacitor,
} from "@/lib/native-push";

export default function NativePushBootstrap() {
  const { token, loading } = useAuth();

  // Attach push-tap handlers once, regardless of auth state, a user
  // could tap a push that wakes the app from cold while logged out
  // (e.g. a "your trial starts now" notification before they reopen the
  // app). The handler routes them anyway; auth gating is handled by the
  // destination route.
  useEffect(() => {
    if (!isRunningInCapacitor()) return;
    void attachNativePushHandlers();
  }, []);

  // Register for pushes only when we have a token to bind the device to.
  useEffect(() => {
    if (loading) return;
    if (!token) return;
    if (!isRunningInCapacitor()) return;
    void registerNativePush(token);
  }, [token, loading]);

  return null;
}
