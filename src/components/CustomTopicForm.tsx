"use client";

import { Loader2 } from "lucide-react";
import { TOPIC_MIN_LENGTH, TOPIC_MAX_LENGTH } from "@/lib/config";

interface CustomTopicFormProps {
  topic: string;
  generating?: boolean;
  onTopicChange: (value: string) => void;
  onGenerate: () => void;
  onBack: () => void;
}

/** Text input for a custom conversation topic with generate/back actions. */
export default function CustomTopicForm({
  topic,
  generating,
  onTopicChange,
  onGenerate,
  onBack,
}: CustomTopicFormProps) {
  return (
    <div className="w-full min-w-0 max-w-xl space-y-4">
      <textarea
        value={topic}
        onChange={(e) => onTopicChange(e.target.value.slice(0, TOPIC_MAX_LENGTH))}
        placeholder="Describe the conversation... e.g. 'A job interview for a senior React developer position at a fast-growing startup'"
        rows={3}
        disabled={generating}
        className="input-bordered rounded-2xl! p-4 text-sm text-foreground placeholder:text-muted/60 resize-none"
      />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            disabled={generating}
            className="btn-secondary"
          >
            Back
          </button>
          <span className="text-xs text-muted/50">
            {topic.length}/{TOPIC_MAX_LENGTH}
          </span>
        </div>
        <button
          onClick={onGenerate}
          disabled={generating || topic.trim().length < TOPIC_MIN_LENGTH}
          className="btn-primary"
        >
          {generating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Generating...
            </>
          ) : (
            "Generate Roles"
          )}
        </button>
      </div>
    </div>
  );
}
