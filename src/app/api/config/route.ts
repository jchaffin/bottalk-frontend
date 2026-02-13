import { NextResponse } from "next/server";
import { VOICES, DEFAULT_VOICE_1, DEFAULT_VOICE_2, TOPIC_MIN_LENGTH, TOPIC_MAX_LENGTH } from "@/lib/config";

/** Client-safe config (voices, limits). No secrets. */
export async function GET() {
  return NextResponse.json({
    voices: VOICES,
    defaultVoice1: DEFAULT_VOICE_1,
    defaultVoice2: DEFAULT_VOICE_2,
    topicMinLength: TOPIC_MIN_LENGTH,
    topicMaxLength: TOPIC_MAX_LENGTH,
  });
}
