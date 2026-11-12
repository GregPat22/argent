import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt =
  "Argent: AI coding agents you can verify. Open-source desktop app. Early prototype; trusted checks planned.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const icon = await readFile(join(process.cwd(), "src/app/icon.png"));

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        width: "100%",
        height: "100%",
        padding: "52px 64px",
        background: "linear-gradient(135deg, #08090c 20%, #262a34 100%)",
        color: "#f0f1f5",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
        <img
          src={`data:image/png;base64,${icon.toString("base64")}`}
          width={76}
          height={76}
          alt=""
        />
        <span style={{ fontSize: 42 }}>Argent</span>
        <span style={{ marginLeft: "auto", fontSize: 24, color: "#b8becb" }}>
          argent.build
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ fontSize: 72, lineHeight: 1.08, letterSpacing: -3 }}>
          AI coding agents
        </div>
        <div
          style={{
            fontSize: 72,
            lineHeight: 1.08,
            letterSpacing: -3,
            color: "#c3ccdd",
          }}
        >
          you can verify.
        </div>
        <div style={{ fontSize: 28, marginTop: 12, color: "#b8becb" }}>
          Open-source desktop app · Claude Code in local worktrees
        </div>
      </div>
      <div
        style={{
          display: "flex",
          borderTop: "1px solid #4a4e58",
          paddingTop: 24,
          fontSize: 23,
          color: "#b8becb",
        }}
      >
        Early prototype · Built from source · Trusted checks planned
      </div>
    </div>,
    size,
  );
}
