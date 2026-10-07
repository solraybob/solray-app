// What to do with a transcription that comes back from the server.
//
// Transcription takes a moment. By the time it lands the member may have
// signed out, left the chat, or opened another conversation. A transcript
// for a previous account or a closed screen is dropped. One that lands in a
// different conversation from the one it was spoken in is never sent on its
// own: it is placed in the message box for the member to send or clear.
// Only in the same conversation does the crisis path send it straight away.

export type VoiceResultAction = "drop" | "send" | "fill";

export function voiceResultAction(o: {
  sameAccount: boolean;
  mounted: boolean;
  sameConversation: boolean;
  crisis: boolean;
}): VoiceResultAction {
  if (!o.sameAccount || !o.mounted) return "drop";
  if (o.crisis && o.sameConversation) return "send";
  return "fill";
}
