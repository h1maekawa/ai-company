import assert from "node:assert/strict";
import test from "node:test";

const voice = await import(`${process.env.MAEMICHI_DIST}/integrations/slack/voice.js`);

test("Slackの音声ファイルだけを受け付ける", () => {
  assert.equal(voice.isSlackAudioFile({ mimetype: "audio/mp4" }), true);
  assert.equal(voice.isSlackAudioFile({ mimetype: "video/mp4" }), false);
  assert.equal(voice.isSlackAudioFile({ mimetype: "text/plain" }), false);
});

test("Slack公式HTTPS URLだけをダウンロード対象にする", () => {
  assert.equal(voice.safeSlackFileUrl("https://files.slack.com/files-pri/T/F/audio.m4a")?.hostname, "files.slack.com");
  assert.equal(voice.safeSlackFileUrl("http://files.slack.com/audio.m4a"), null);
  assert.equal(voice.safeSlackFileUrl("https://slack.com.example.com/audio.m4a"), null);
  assert.equal(voice.safeSlackFileUrl("https://example.com/audio.m4a"), null);
});

test("Aqua Voiceで入力したX下書き本文を言い換えず取り出す", () => {
  assert.equal(
    voice.extractVerbatimXDraft("X下書き：マジ明日だるいな。会社行きたくない。"),
    "マジ明日だるいな。会社行きたくない。"
  );
  assert.equal(
    voice.extractVerbatimXDraft("エックス投稿下書きへ 今日は普通に疲れた。"),
    "今日は普通に疲れた。"
  );
  assert.equal(voice.extractVerbatimXDraft("半導体について調べて"), null);
});
