// Small oil-bottle symbol used wherever staff "give oil" (replaces the old box emoji).
export default function OilIcon({ size = 22 }: { size?: number }) {
  return (
    <svg className="oil-ic" width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false" style={{ verticalAlign: "-0.2em", flex: "none" }}>
      <rect x="9.5" y="1.6" width="5" height="2.6" rx="1" fill="#6b7280" />
      <path d="M10 4.2h4v2.2c0 .7.5 1.3 1.1 1.7 1.2.8 1.9 2 1.9 3.5V20a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-8.4c0-1.5.7-2.7 1.9-3.5.6-.4 1.1-1 1.1-1.7V4.2z" fill="#f5b83d" stroke="#b7791f" strokeWidth="1" strokeLinejoin="round" />
      <rect x="8.4" y="12.2" width="7.2" height="5.2" rx="1" fill="#fff8e1" opacity=".9" />
      <path d="M10.2 8.9c.4-.5 1-.8 1.6-.8" stroke="#fff" strokeWidth="1" strokeLinecap="round" fill="none" opacity=".8" />
    </svg>
  );
}
