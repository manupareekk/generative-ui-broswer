export type PageHotspot = {
  id: string;
  label: string;
  next_query: string;
  rect: { x: number; y: number; w: number; h: number };
};

export type StreamEvent =
  | { type: "session_started"; session_id: string }
  | { type: "phase"; phase: string; detail?: string }
  | { type: "progress"; value: number }
  | {
      type: "region_resolved";
      session_id: string;
      subject: string;
      next_query: string;
      cx_px: number;
      cy_px: number;
      r_px: number;
    }
  | {
      type: "page";
      title: string;
      query: string;
      /** Same session branch: what the user typed last navigate (e.g. "Japan"). */
      anchor_query?: string;
      image_url: string;
      session_id: string;
      image_variants?: Record<string, string>;
      content_id?: string;
      hotspots?: PageHotspot[];
      client_trace?: string;
    }
  | { type: "error"; message: string; client_trace?: string };
