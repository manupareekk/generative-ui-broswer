export type StreamEvent =
  | { type: "session_started"; session_id: string }
  | { type: "phase"; phase: string; detail?: string }
  | { type: "tap_resolved"; session_id: string; subject: string; next_query: string; x: number; y: number }
  | { type: "progress"; value: number }
  | {
      type: "page";
      title: string;
      query: string;
      image_url: string;
      session_id: string;
      image_variants?: Record<string, string>;
    }
  | { type: "error"; message: string };
