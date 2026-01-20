export function parseYouTubeVideoId(youtubeUrl) {
  if (typeof youtubeUrl !== "string" || !youtubeUrl.trim()) return null;

  const raw = youtubeUrl.trim();

  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();

    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return id || null;
    }

    if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
      const pathParts = url.pathname.split("/").filter(Boolean);

      if (url.pathname === "/watch") {
        const id = url.searchParams.get("v");
        return id || null;
      }

      if (pathParts[0] === "embed" || pathParts[0] === "shorts") {
        const id = pathParts[1];
        return id || null;
      }
    }
  } catch {
    const match =
      raw.match(/(?:youtu\.be\/|v=|\/embed\/|\/shorts\/)([A-Za-z0-9_-]{6,})/) ||
      null;
    return match?.[1] || null;
  }

  return null;
}

export function getYouTubeThumbnailUrl(youtubeUrl) {
  const id = parseYouTubeVideoId(youtubeUrl);
  if (!id) return null;
  return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
}
