"use client";

/**
 * lib/native-voice.ts, voice recording bridge.
 *
 * Inside the Capacitor native shell on iOS or Android, uses the
 * native microphone API via the capacitor-voice-recorder plugin.
 * That bypasses the WebKit cage that prevents installed iOS PWAs
 * from accessing getUserMedia, and gives us proper system mic
 * permission UX (the iOS permission sheet).
 *
 * On the web, this module is a no-op shell, the chat page detects
 * isRunningInCapacitor() and falls back to its existing MediaRecorder
 * + getUserMedia path.
 *
 * Recording produces a base64 audio string + a mime type. We convert
 * that to a Blob and POST to the existing /chat/transcribe backend
 * endpoint, which already accepts audio blobs from MediaRecorder. No
 * backend change needed.
 */

import { isRunningInCapacitor } from "./native-push";

export interface NativeVoiceResult {
  blob: Blob;
  mimeType: string;
}

/**
 * Request mic permission. Idempotent, returns true if already granted.
 * On iOS this triggers the system permission sheet the FIRST time.
 * Subsequent calls reuse the cached grant. If the user denies, the
 * caller should surface a Settings → Privacy → Microphone hint.
 */
export async function requestNativeMicPermission(): Promise<boolean> {
  if (!isRunningInCapacitor()) return false;
  try {
    const { VoiceRecorder } = await import("capacitor-voice-recorder");
    const status = await VoiceRecorder.hasAudioRecordingPermission();
    if (status.value) return true;
    const req = await VoiceRecorder.requestAudioRecordingPermission();
    return Boolean(req.value);
  } catch (err) {
    console.warn("[native-voice] permission request failed", err);
    return false;
  }
}

/**
 * Begin recording. Returns true if it started, false on failure
 * (permission, hardware, plugin error). The caller is expected to
 * own UI state (recording indicator, stop button, etc.).
 */
export async function startNativeRecording(): Promise<boolean> {
  if (!isRunningInCapacitor()) return false;
  try {
    const { VoiceRecorder } = await import("capacitor-voice-recorder");
    const granted = await requestNativeMicPermission();
    if (!granted) return false;
    const result = await VoiceRecorder.startRecording();
    return Boolean(result?.value);
  } catch (err) {
    console.warn("[native-voice] startRecording failed", err);
    return false;
  }
}

/**
 * Stop recording and return the audio as a Blob ready to POST.
 * The plugin returns base64 + mimeType; we re-hydrate to a Blob so
 * the existing transcribeBlob() flow in chat works without branching.
 */
export async function stopNativeRecording(): Promise<NativeVoiceResult | null> {
  if (!isRunningInCapacitor()) return null;
  try {
    const { VoiceRecorder } = await import("capacitor-voice-recorder");
    const result = await VoiceRecorder.stopRecording();
    const value = result?.value as
      | { recordDataBase64?: string; mimeType?: string }
      | undefined;
    if (!value?.recordDataBase64) return null;

    const mimeType = value.mimeType || "audio/aac";

    // Decode base64 → Uint8Array → Blob.
    const binary = atob(value.recordDataBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: mimeType });

    return { blob, mimeType };
  } catch (err) {
    console.warn("[native-voice] stopRecording failed", err);
    return null;
  }
}

/**
 * Cancel an in-flight recording without returning audio. Used when
 * the user changes their mind or navigates away.
 */
export async function cancelNativeRecording(): Promise<void> {
  if (!isRunningInCapacitor()) return;
  try {
    const { VoiceRecorder } = await import("capacitor-voice-recorder");
    // The plugin doesn't expose a true cancel; stopping and discarding
    // the result is equivalent. We still call stop so the underlying
    // audio session releases the mic, otherwise the iOS recording
    // indicator would stay lit.
    await VoiceRecorder.stopRecording().catch(() => null);
  } catch { /* ignore */ }
}
