const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const AUDIO_MIME_TYPES = new Set([
  "audio/aac",
  "audio/m4a",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "audio/x-m4a",
]);

export type SlackAudioFile = {
  id?: string;
  name?: string;
  mimetype?: string;
  size?: number;
  url_private?: string;
  url_private_download?: string;
};

/** Aqua VoiceなどがSlack入力欄へ入れた文章を、AIへ渡さずそのまま下書きにする。 */
export function extractVerbatimXDraft(text: string): string | null {
  const match = text.trim().match(/^(?:X|x|エックス)\s*(?:投稿)?\s*下書き\s*(?:に|へ)?\s*[：:]?\s*([\s\S]+)$/u);
  const draft = match?.[1]?.trim();
  return draft || null;
}

export function isSlackAudioFile(file: SlackAudioFile): boolean {
  return Boolean(file.mimetype && AUDIO_MIME_TYPES.has(file.mimetype.toLowerCase()));
}

export function safeSlackFileUrl(value: string | undefined): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const allowed = url.hostname === "slack.com" || url.hostname.endsWith(".slack.com");
    return url.protocol === "https:" && allowed ? url : null;
  } catch {
    return null;
  }
}

export async function transcribeSlackAudio(file: SlackAudioFile): Promise<string> {
  const slackToken = process.env.SLACK_BOT_TOKEN;
  const openAIKey = process.env.OPENAI_API_KEY;
  if (!slackToken) throw new Error("SLACK_BOT_TOKEN is required for voice input");
  if (!openAIKey) throw new Error("OPENAI_API_KEY is required for voice input");
  if (!isSlackAudioFile(file)) throw new Error("Unsupported audio type");
  if (typeof file.size === "number" && file.size > MAX_AUDIO_BYTES) {
    throw new Error("Audio file is too large");
  }

  const sourceUrl = safeSlackFileUrl(file.url_private_download ?? file.url_private);
  if (!sourceUrl) throw new Error("Invalid Slack audio URL");
  const audioResponse = await fetch(sourceUrl, {
    headers: { Authorization: `Bearer ${slackToken}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!audioResponse.ok) throw new Error(`Slack audio download failed: ${audioResponse.status}`);
  const audio = await audioResponse.arrayBuffer();
  if (audio.byteLength > MAX_AUDIO_BYTES) throw new Error("Audio file is too large");

  const form = new FormData();
  form.append("file", new Blob([audio], { type: file.mimetype }), file.name || "slack-voice.m4a");
  form.append("model", process.env.OPENAI_TRANSCRIPTION_MODEL || "whisper-1");
  form.append("language", "ja");
  form.append("response_format", "json");
  form.append(
    "prompt",
    "日本語の話し言葉を文字起こしする。要約、丁寧語への変換、言い換え、文体調整をしない。えっと、あの、マジ、など本人が話した表現も可能な限り残す。"
  );

  const transcriptionResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${openAIKey}` },
    body: form,
    signal: AbortSignal.timeout(45_000),
  });
  if (!transcriptionResponse.ok) {
    throw new Error(`Audio transcription failed: ${transcriptionResponse.status}`);
  }
  const result = (await transcriptionResponse.json()) as { text?: string };
  const transcript = result.text?.trim();
  if (!transcript) throw new Error("Audio transcription returned no text");
  return transcript;
}
