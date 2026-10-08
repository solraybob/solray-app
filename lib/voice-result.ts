// What to do with a transcription that comes back from the server.
//
// Transcription takes a moment. By the time it lands the member may have
// signed out or left the chat. A transcript for a previous account or a
// closed screen is dropped. Otherwise it is placed in the message box (of
// the conversation it was spoken in) for the member to send or clear; it is
// never sent on its own.

export type VoiceResultAction = "drop" | "fill";

export function voiceResultAction(o: {
  sameAccount: boolean;
  mounted: boolean;
}): VoiceResultAction {
  if (!o.sameAccount || !o.mounted) return "drop";
  return "fill";
}
