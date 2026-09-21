import { useRef, useState } from "react";
import type { Stroke } from "./history";
// Original vector outlines. Coordinates are stored in the SVG viewBox, independent of screen size.
function Figure({ back = false }: { back?: boolean }) {
  return (
    <g
      fill="#f4f7f8"
      stroke="#647e8b"
      strokeWidth="1.5"
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      <path
        d="M52 43 C44 38 42 27 44 16 C46 2 67 2 70 16 C72 27 68 38 62 43 L63 51 C71 54 83 55 88 65 C93 76 92 89 96 101 L106 131 L111 151 L117 166 Q116 171 113 167 L107 156 L111 174 Q109 178 106 172 L101 157 L103 175 Q100 177 98 171 L95 155 Q91 159 89 155 L92 146 L88 129 L77 98 L76 120 Q80 143 77 159 L70 196 L68 220 L66 254 L66 277 L72 291 Q71 296 62 294 L56 291 L55 276 L55 249 L53 221 L55 198 L54 171 L51 171 L49 198 L51 221 L47 249 L47 276 L46 291 L40 295 Q31 297 30 291 L37 277 L37 253 L35 220 L33 196 L26 159 Q23 141 28 120 L28 98 L18 129 L14 146 L17 155 Q15 159 11 155 L8 171 Q6 177 3 175 L5 157 L0 172 Q-3 178 -5 174 L-1 156 L-7 167 Q-10 171 -11 166 L-5 151 L0 131 L10 101 C14 89 13 76 18 65 C23 55 35 54 44 51 L45 43"
        transform="translate(12)"
      />
      {back ? (
        <g>
          <path d="M64 46 L65 123 M48 63 Q35 77 51 94 L58 65 M81 63 Q94 77 77 94 L70 65 M44 128 Q55 121 65 131 Q76 121 88 128 M43 147 Q56 158 65 145 Q74 158 87 147 M65 130 L65 146 M48 205 L57 205 M73 205 L81 205 M52 242 L55 272 M77 242 L76 272" />
          <path strokeDasharray="2 4" d="M65 54 L65 125" />
        </g>
      ) : (
        <g>
          <path d="M60 24 L62 24 M73 24 L75 24 M66 25 L64 33 L68 33 M61 37 Q66 40 72 37 M49 62 L62 66 L65 57 M81 62 L70 66 L67 57 M43 80 Q53 86 64 80 M70 80 Q81 86 89 80 M65 83 L65 122 M63 113 L67 113 M42 138 L61 154 M88 138 L69 154 M62 159 L68 159 M45 203 Q51 194 58 203 M73 203 Q80 194 84 203 M50 222 L52 266 M79 222 L78 266" />
        </g>
      )}
    </g>
  );
}
function SideFigure({ flip = false }: { flip?: boolean }) {
  return (
    <g
      transform={flip ? "translate(124 0) scale(-1 1)" : undefined}
      fill="#f4f7f8"
      stroke="#647e8b"
      strokeWidth="1.5"
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      <path d="M62 48 L60 41 L53 38 L53 31 L47 29 L52 22 Q48 5 65 5 Q84 4 83 24 Q83 35 75 43 L77 52 Q89 62 88 79 L83 108 Q89 122 84 139 Q88 158 79 179 L70 203 L70 225 L64 274 L67 283 L80 289 Q85 295 76 295 L54 293 L53 279 L56 244 L54 216 L59 194 L57 167 Q50 151 54 137 Q47 123 53 111 L51 97 Q43 85 51 73 L55 57 Z" />
      <path d="M64 63 Q76 60 77 76 L70 107 L70 132 L67 150 L68 167 Q65 173 62 168 L61 155 L58 161 Q54 163 55 158 L59 145 L59 120 L57 107 L58 81 M57 23 L59 23 M53 34 L58 34 M59 141 Q72 143 79 153 M60 200 L68 203 M63 217 L62 265" />
    </g>
  );
}
export default function BodyMap({
  label,
  value,
  onChange,
  signature = false,
}: {
  label: string;
  value: Stroke[];
  onChange: (v: Stroke[]) => void;
  signature?: boolean;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const active = useRef<[number, number][] | null>(null);
  const [draft, setDraft] = useState<[number, number][]>([]);
  const [view, setView] = useState("all");
  const [drawing, setDrawing] = useState(signature);
  const [limit, setLimit] = useState(false);
  const width = signature ? 600 : 560,
    height = signature ? 130 : 340;
  function point(e: React.PointerEvent<SVGSVGElement>): [number, number] {
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(
      svg.current!.getScreenCTM()!.inverse(),
    );
    return [
      Math.round(Math.max(0, Math.min(width, p.x)) * 10) / 10,
      Math.round(Math.max(0, Math.min(height, p.y)) * 10) / 10,
    ];
  }
  function finish(e: React.PointerEvent<SVGSVGElement>) {
    if (!active.current) return;
    const points = active.current;
    active.current = null;
    setDraft([]);
    onChange([...value, { points }]);
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  }
  const paths = [...value, ...(draft.length ? [{ points: draft }] : [])];
  return (
    <div className="body-map">
      <div className="map-toolbar">
        <strong>{label}</strong>
        <div>
          {!signature && (
            <select
              aria-label={label + " view"}
              value={view}
              onChange={(e) => setView(e.target.value)}
            >
              <option value="all">All views</option>
              <option value="0">Anterior</option>
              <option value="1">Left lateral</option>
              <option value="2">Right lateral</option>
              <option value="3">Posterior</option>
            </select>
          )}
          {!signature && (
            <button
              type="button"
              aria-pressed={drawing}
              className={drawing ? "map-active" : ""}
              onClick={() => setDrawing(!drawing)}
            >
              {drawing ? "Red pen on" : "Enable red pen"}
            </button>
          )}
          <button
            type="button"
            disabled={!value.length}
            onClick={() => onChange(value.slice(0, -1))}
          >
            Undo
          </button>
          <button
            type="button"
            disabled={!value.length}
            onClick={() => {
              if (window.confirm("Clear these markings?")) onChange([]);
            }}
          >
            Clear
          </button>
        </div>
      </div>
      <svg
        ref={svg}
        viewBox={
          !signature && view !== "all"
            ? `${Number(view) * 140} 0 140 ${height}`
            : `0 0 ${width} ${height}`
        }
        role="img"
        aria-label={
          label +
          (signature
            ? " signature pad"
            : " — anterior, left lateral, right lateral and posterior views")
        }
        style={{
          touchAction: drawing ? "none" : "pan-y",
          cursor: drawing ? "crosshair" : "default",
        }}
        onPointerDown={(e) => {
          if (!drawing || e.button !== 0) return;
          if (value.length >= 160) {
            setLimit(true);
            return;
          }
          e.currentTarget.setPointerCapture(e.pointerId);
          active.current = [point(e)];
          setDraft(active.current);
        }}
        onPointerMove={(e) => {
          if (!active.current || active.current.length >= 1000) return;
          const p = point(e);
          const prev = active.current.at(-1)!;
          if (Math.hypot(p[0] - prev[0], p[1] - prev[1]) < 1.5) return;
          active.current = [...active.current, p];
          setDraft(active.current);
        }}
        onPointerUp={finish}
        onPointerCancel={finish}
        onLostPointerCapture={(e) => {
          if (active.current) finish(e);
        }}
      >
        {signature ? (
          <path d="M20 103 H580" stroke="#ccdbe0" />
        ) : (
          <>
            <g transform="translate(5 12)">
              <Figure />
            </g>
            <g transform="translate(145 12)">
              <SideFigure />
            </g>
            <g transform="translate(280 12)">
              <SideFigure flip />
            </g>
            <g transform="translate(420 12)">
              <Figure back />
            </g>
            {["Anterior", "Left lateral", "Right lateral", "Posterior"].map(
              (s, i) => (
                <text
                  key={s}
                  x={70 + i * 140}
                  y="332"
                  textAnchor="middle"
                  fill="#476879"
                  fontSize="12"
                >
                  {s}
                </text>
              ),
            )}
            <g fontSize="10" fill="#647e8b">
              <text x="23" y="85">
                R
              </text>
              <text x="110" y="85">
                L
              </text>
              <text x="439" y="85">
                L
              </text>
              <text x="527" y="85">
                R
              </text>
            </g>
          </>
        )}
        <g
          stroke="#d32f3f"
          fill="none"
          strokeWidth={signature ? 2 : 2.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          pointerEvents="none"
        >
          {paths.map((s, i) =>
            s.points.length === 1 ? (
              <circle
                key={i}
                cx={s.points[0][0]}
                cy={s.points[0][1]}
                r="1.4"
                fill="#d32f3f"
              />
            ) : (
              <polyline
                key={i}
                points={s.points.map((p) => p.join(",")).join(" ")}
              />
            ),
          )}
        </g>
      </svg>
      <p className="small muted">
        {signature
          ? "Sign with a finger, stylus or mouse."
          : "Enable the pen, then draw or tap in red. Turn it off to scroll on a phone. L/R refer to the client’s left/right."}
      </p>
      {limit && (
        <p role="alert">
          Marking limit reached. Undo or clear marks before adding more.
        </p>
      )}
    </div>
  );
}
