"use client";

import { memberErrorText, MemberError } from "@/lib/member-error";
import { useEffect, useRef, useState, useCallback } from "react";
import { apiFetch, ApiError, detailCode, trackRequest } from "@/lib/api";
import { voiceResultAction } from "@/lib/voice-result";
import { captureAccount } from "@/lib/account-session";
import { AI_CONSENT_REQUIRED_CODE, openAiConsentSheet } from "@/lib/ai-consent";
import { errorText } from "@/lib/errors";
import type { useChatState } from "./useChatState";

export function useChatVoice(pageCtx: ReturnType<typeof useChatState>) {
  const {
    activeSessionRef, conversationExists, holdVoice, input, inputRef, isMountedRef, isRecording,
    lastTranscriptRef, mediaRecorderRef, mediaStreamRef, offerOrphanVoice, recordMimeRef,
    recordedChunksRef, releaseVoice, setChatNotice, setInput, setIsRecording, setTranscribing,
    setVoiceError, t, token, tokenRef, voiceDraftsRef, voiceOriginRef
  } = pageCtx;
  // Tear down recorder + mic stream on unmount so the iOS mic indicator
  // doesn't linger after the user navigates away mid-recording. Covers
  // both the web MediaRecorder path AND the native Capacitor
  // VoiceRecorder path; previously only the web path was cleaned up,
  // so a native recording session could keep the mic indicator alive
  // after leaving chat. Caught by Codex audit P2.6.
  useEffect(() => {
    return () => {
      try {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
          mediaRecorderRef.current.stop();
        }
      } catch {
        // ignore
      }
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
      mediaRecorderRef.current = null;
      // Leaving the chat ends the recording: nothing left to protect.
      releaseVoice();

      // Cancel any active native recording. Fire-and-forget; we are on
      // the unmount path and cannot await. The plugin call is
      // idempotent, calling cancel when nothing is recording is a
      // no-op.
      if (nativeRecordingRef.current) {
        nativeRecordingRef.current = false;
        void import("@/lib/native-voice").then(({ cancelNativeRecording }) => {
          cancelNativeRecording().catch(() => {});
        }).catch(() => {});
      }
    };
  }, []);

  // Pick a MediaRecorder mimeType the current browser actually supports.
  // Order matters: Chrome/Android prefer webm/opus, iOS Safari only does mp4.
  const pickRecorderMime = useCallback((): string => {
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4;codecs=mp4a.40.2",
      "audio/mp4",
      "audio/aac",
    ];
    for (const m of candidates) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(m)) {
        return m;
      }
    }
    return ""; // let the browser default
  }, []);

  // Send a recorded blob to the backend Whisper endpoint and append the
  // transcript to whatever the user has typed so far.
  const transcribeBlob = useCallback(async (blob: Blob, mime: string) => {
    if (!blob.size) {
      setTranscribing(false);
      releaseVoice();
      return;
    }
    const apiUrl = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").trim();
    const ext = mime.includes("mp4") || mime.includes("aac") ? "m4a" : "webm";
    const form = new FormData();
    form.append("file", blob, `voice.${ext}`);

    setTranscribing(true);
    // Who and where this was spoken: captured when the microphone was asked
    // for (voiceOriginRef), so a conversation switch while recording or
    // stopping never moves it. Checked again when the text lands.
    const origin = voiceOriginRef.current;
    const acct = origin?.acct ?? captureAccount();
    const spokenIn = origin ? origin.session : activeSessionRef.current;
    // The conversation it was spoken in.
    if (spokenIn) form.append("session_id", spokenIn);
    const landing = () => voiceResultAction({
      sameAccount: acct.live,
      mounted: isMountedRef.current,
    });
    try {
      const authToken = origin ? origin.token : (tokenRef.current || token);
      const { res, body } = await trackRequest(async () => {
        const r = await fetch(`${apiUrl}/chat/transcribe`, {
          method: "POST",
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
          body: form,
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const b: any = await r.json().catch(() => null);
        return { res: r, body: b };
      });
      if (landing() === "drop") return;
      if (!res.ok) {
        let detail = "";
        let code = "";
        try {
          detail = errorText(body?.detail, "");
          code = detailCode(body?.detail) || "";
        } catch {
          // ignore
        }
        // Voice goes to a transcription provider: without AI consent the
        // server refuses, and the consent sheet explains why.
        if (res.status === 403 && code === AI_CONSENT_REQUIRED_CODE) {
          openAiConsentSheet();
          throw new MemberError(t("chat.consent_needed"));
        }
        // Today's voice limit and the other known refusals, and the
        // transcription's own coded refusals (too long, empty, not set up,
        // failed): plain words in the member's language. The server's text
        // is never shown (Codex out18-5).
        throw new MemberError(memberErrorText(
          new ApiError(detail, res.status, code || undefined, body?.detail), t, "chat.voice_transcription_failed",
          { byStatus: { 400: "chat.voice_empty", 413: "chat.voice_too_long", 503: "chat.voice_warming_up" } },
        ));
      }
      const data = body;
      const transcript = (data?.transcript || "").trim();
      if (!transcript) {
        setVoiceError(t("chat.voice_nothing_heard"));
        return;
      }
      // The member is in another conversation now: the words belong to the
      // one they were spoken in and wait for its box. A notice here offers
      // to open it.
      if (spokenIn && activeSessionRef.current !== spokenIn) {
        if (!conversationExists(spokenIn)) {
          // Deleted before the words arrived: nowhere to park them. Offered
          // here instead, to put in this box or discard.
          offerOrphanVoice({ text: transcript, transcript });
          return;
        }
        const prev = voiceDraftsRef.current.get(spokenIn);
        voiceDraftsRef.current.set(spokenIn, prev
          ? { text: `${prev.text} ${transcript}`, transcript: `${prev.transcript} ${transcript}` }
          : { text: transcript, transcript });
        setChatNotice({ kind: "voice_elsewhere", sessionId: activeSessionRef.current, target: spokenIn });
        return;
      }
      lastTranscriptRef.current = transcript;
      setInput((prev) => {
        const base = prev.replace(/\s+$/, "");
        return base ? base + " " + transcript : transcript;
      });
      // Focus so the user can edit before sending.
      requestAnimationFrame(() => inputRef.current?.focus());
    } catch (err: unknown) {
      if (landing() === "drop") return;
      const msg = memberErrorText(err, t, "chat.voice_failed");
      setVoiceError(msg);
    } finally {
      if (isMountedRef.current) setTranscribing(false);
      // Transcription is done: its text (if any) is in the composer now.
      releaseVoice();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, t]);

  // True while a native (Capacitor) voice recording is active. Distinct
  // from the MediaRecorder web flow because the stop/transcribe path
  // looks completely different. We track which mode is active so the
  // stop button knows where to dispatch.
  const nativeRecordingRef = useRef<boolean>(false);

  const stopRecording = useCallback(async () => {
    // Native path: ask the Capacitor plugin to stop, get the blob back,
    // hand it to the same transcribeBlob() the web flow uses.
    if (nativeRecordingRef.current) {
      nativeRecordingRef.current = false;
      try {
        const { stopNativeRecording } = await import("@/lib/native-voice");
        const result = await stopNativeRecording();
        setIsRecording(false);
        if (result) {
          await transcribeBlob(result.blob, result.mimeType);
        } else {
          releaseVoice();
          setVoiceError(t("chat.voice_no_audio"));
        }
      } catch (err) {
        releaseVoice();
        setIsRecording(false);
        console.warn("[chat] native stop failed", err);
        setVoiceError(t("chat.voice_stop_failed"));
      }
      return;
    }
    // Web path: stop the MediaRecorder; its onstop handler runs the
    // transcription flow.
    try {
      const rec = mediaRecorderRef.current;
      if (rec && rec.state !== "inactive") {
        rec.stop();
      }
    } catch {
      // ignore
    }
  }, [transcribeBlob]);

  const toggleRecording = useCallback(async () => {
    if (typeof window === "undefined") return;

    if (isRecording) {
      stopRecording();
      return;
    }

    setVoiceError(null);
    // From here until transcription (or a cancel or failure), a reload
    // would lose the recording.
    holdVoice();
    voiceOriginRef.current = {
      session: activeSessionRef.current,
      acct: captureAccount(),
      token: tokenRef.current || token,
    };

    // Native (Capacitor) shell: use the proper iOS/Android microphone
    // API via the capacitor-voice-recorder plugin. This is the path
    // that finally lets paying iOS users use voice from inside the
    // installed app, with no WebKit cage and no Safari workaround.
    try {
      const { isRunningInCapacitor } = await import("@/lib/native-push");
      if (isRunningInCapacitor()) {
        const { startNativeRecording, cancelNativeRecording } = await import("@/lib/native-voice");
        const ok = await startNativeRecording();
        // The member left the chat while the microphone was starting (the
        // permission prompt can take a while): stop it at once instead of
        // leaving a recording running with no screen to end it.
        if (!isMountedRef.current) {
          if (ok) await cancelNativeRecording().catch(() => {});
          releaseVoice();
          return;
        }
        if (ok) {
          nativeRecordingRef.current = true;
          setIsRecording(true);
        } else {
          releaseVoice();
          setVoiceError(t("chat.voice_perm_denied_native"));
        }
        return;
      }
    } catch (err) {
      console.warn("[chat] native voice path failed, falling back to web", err);
      // Fall through to the web MediaRecorder path below.
    }

    // Detect the runtime context first so we can give an accurate error
    // when getUserMedia fails. Three contexts behave very differently:
    //
    //   1. Regular browser (Safari, Chrome, Firefox tab): getUserMedia
    //      shows the system permission prompt the first time, and
    //      respects the user's grant on subsequent calls.
    //
    //   2. Installed PWA on iOS Safari (Add to Home Screen): a
    //      long-standing WKWebView limitation means getUserMedia often
    //      throws NotAllowedError even when iOS Settings shows the
    //      microphone enabled for solray.ai. There is no JS-side
    //      workaround. Users must either (a) use the regular Safari
    //      tab, or (b) wait for our native Capacitor build, which uses
    //      a proper native mic API.
    //
    //   3. Installed PWA on Android Chrome: works as expected, no
    //      special handling needed.
    const isStandalonePWA = (() => {
      if (typeof window === "undefined") return false;
      const nav = window.navigator as unknown as { standalone?: boolean };
      const matchesStandalone = window.matchMedia?.("(display-mode: standalone)")?.matches;
      return Boolean(nav.standalone) || Boolean(matchesStandalone);
    })();
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent || "")
      || (navigator.platform === "MacIntel" && (navigator as unknown as { maxTouchPoints?: number }).maxTouchPoints! > 1);

    // Detect Chrome so we can give Chrome-specific guidance for its
    // three-layer permission model (OS → browser → site).
    const ua = navigator.userAgent || "";
    const isChrome = /Chrome\/\d/.test(ua) && !/Edg\/|OPR\//.test(ua);

    // Ask the Permissions API what the OS-level grant actually says.
    // Useful for distinguishing "user denied" from "user granted but
    // the platform still won't honor it" (the iOS PWA case, or a
    // Chrome OS-permission block on macOS/Windows).
    let permissionState: PermissionState | "unknown" = "unknown";
    try {
      const res = await (navigator.permissions as unknown as {
        query: (d: { name: PermissionName }) => Promise<PermissionStatus>;
      })?.query?.({ name: "microphone" as PermissionName });
      if (res?.state) permissionState = res.state;
    } catch { /* ignore, fall through to getUserMedia */ }

    // Diagnostic dump: anytime mic prep happens, log a single object
    // with everything we know. Open DevTools → Console and tap mic to
    // capture this. Helps differentiate "site permission blocked",
    // "OS permission blocked", "iOS PWA cage", and "hardware muted".
    // Mic preflight diagnostics. Gated behind the dev environment OR
    // an explicit ?mic_debug=1 query param so a power user (or
    // OpenClaw debugging on the Mac) can flip them on without a
    // rebuild. Previously gated with "|| true" which meant every
    // single mic attempt logged user-agent + permission state in
    // production, fine for a one-week debug window but not for a
    // polished paid app. Caught by Codex audit P3.8.
    const micDebug =
      process.env.NODE_ENV !== "production" ||
      (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("mic_debug") === "1");
    if (micDebug) {
      // eslint-disable-next-line no-console
      console.log("[solray-mic] preflight", {
        userAgent: ua,
        isChrome,
        isIOS,
        isStandalonePWA,
        permissionState,
        host: window.location.host,
        protocol: window.location.protocol,
      });
    }

    // Ask for the mic.
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Left the chat while the permission prompt was open: release the mic.
      if (!isMountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        releaseVoice();
        return;
      }
    } catch (err: unknown) {
      releaseVoice();
      const e = err as { name?: string; message?: string };
      const name = e?.name || "";
      // eslint-disable-next-line no-console
      console.error("[solray-mic] getUserMedia failed", {
        name, message: e?.message,
        permissionState, isChrome, isIOS, isStandalonePWA,
      });
      if (name === "NotAllowedError" || name === "SecurityError") {
        if ((permissionState === "granted" || permissionState === "unknown") && isIOS && isStandalonePWA) {
          // iOS PWA WebKit cage. Offer the Safari fallback link.
          setVoiceError(t("chat.voice_ios_pwa"));
        } else if (isChrome && permissionState === "granted") {
          // Chrome thinks the site has permission, but the browser
          // got NotAllowedError anyway. That means the OS layer is
          // blocking, macOS Privacy & Security or Windows mic
          // privacy. The user has to flip a system toggle, no
          // browser-side fix.
          setVoiceError(t("chat.voice_chrome_os_block"));
        } else if (isChrome && permissionState === "denied") {
          // Chrome's per-site permission says blocked. The fix is
          // the lock icon, toggling Chrome's general mic setting
          // does not override a per-site block.
          setVoiceError(t("chat.voice_chrome_site_block"));
        } else if (isChrome) {
          // Chrome with unknown permission state, most likely a
          // first-time block-popup answer. Same fix as denied.
          setVoiceError(t("chat.voice_chrome_denied"));
        } else if (permissionState === "denied") {
          setVoiceError(t("chat.voice_denied_browser"));
        } else if (isIOS && isStandalonePWA) {
          setVoiceError(t("chat.voice_ios_pwa"));
        } else {
          setVoiceError(t("chat.voice_blocked"));
        }
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        setVoiceError(t("chat.voice_not_found"));
      } else {
        setVoiceError(t("chat.voice_open_failed"));
      }
      return;
    }

    const mime = pickRecorderMime();
    recordMimeRef.current = mime || "audio/webm";

    let recorder: MediaRecorder;
    try {
      recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      releaseVoice();
      setVoiceError(t("chat.voice_cant_record"));
      return;
    }

    recordedChunksRef.current = [];
    mediaRecorderRef.current = recorder;
    mediaStreamRef.current = stream;

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        recordedChunksRef.current.push(e.data);
      }
    };

    recorder.onstop = () => {
      const chunks = recordedChunksRef.current;
      const usedMime = recordMimeRef.current || recorder.mimeType || "audio/webm";
      const blob = new Blob(chunks, { type: usedMime });
      // Release the mic immediately so the iOS recording indicator clears.
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
      mediaRecorderRef.current = null;
      recordedChunksRef.current = [];
      setIsRecording(false);
      transcribeBlob(blob, usedMime);
    };

    recorder.onerror = () => {
      releaseVoice();
      setVoiceError(t("chat.voice_stopped_unexpectedly"));
      stream.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      mediaRecorderRef.current = null;
      setIsRecording(false);
    };

    try {
      recorder.start();
      setIsRecording(true);
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      mediaRecorderRef.current = null;
      releaseVoice();
      setVoiceError(t("chat.voice_start_failed"));
    }
  }, [isRecording, pickRecorderMime, stopRecording, transcribeBlob]);

  // Auto-grow textarea as user types. Keeps text visible (no sideways scroll)
  // and caps at 6 lines so the composer never eats the conversation.
  const resizeInput = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    const lineHeight = 22; // matches text-base leading
    const maxHeight = lineHeight * 6 + 24; // ~6 lines + vertical padding
    const next = Math.min(el.scrollHeight, maxHeight);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }, []);

  useEffect(() => {
    resizeInput();
  }, [input, resizeInput]);

  const formatTime = (iso: string) => {
    return new Date(iso).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Per-message actions: copy the reply, and a quiet "this landed" resonance
  // mark that feeds the Akashic loop with an explicit, clean signal (the
  // positive twin of the implicit affirmation detection). Both are subtle and
  // sit only under finalized Oracle replies.
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [resonatedIds, setResonatedIds] = useState<Set<string>>(new Set());

  const copyMessage = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1800);
    } catch { /* clipboard blocked; no-op */ }
  };

  const markResonance = async (id: string, text: string) => {
    if (resonatedIds.has(id)) return;
    setResonatedIds((prev) => new Set(prev).add(id));
    try {
      await apiFetch(
        "/chat/feedback",
        { method: "POST", body: JSON.stringify({ oracle_text: text, direction: "landed" }) },
        token,
      );
    } catch { /* best-effort; the mark stays for the user regardless */ }
  };

  return { copiedId, copyMessage, formatTime, markResonance, resonatedIds, toggleRecording };
}
