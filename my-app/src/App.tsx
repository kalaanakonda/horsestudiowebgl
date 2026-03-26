import { useEffect, useMemo, useRef, useState } from "react";
import { ModelDither } from "@kalaanakonda/ditherking-react";

const DEFAULT_MODEL_URL = "/ethereum_3d_logo.glb";

const DEFAULT_PRESET = {
  dither: "bayer",
  shape: "box",
  sampleStep: 4,
  particleSize: 1.8,
  threshold: 139,
  colorMode: "mono",
  backgroundColor: "#000000",
  particleColor: "#ffffff",
  black: 0,
  mid: 3.5,
  white: 176,
  ditherBackground: true,
  tiltStrength: 1.95,
  pointerTilt: true,
  posX: 0,
  posY: 0,
  posZ: 0,
  rotXDeg: 0,
  rotYDeg: 0,
  rotZDeg: 0,
} as const;

const INSTALL_CMD = "npm i @kalaanakonda/ditherking-react";

const VIEWER_SNIPPET = `import { ModelDither } from "@kalaanakonda/ditherking-react";

const PRESET = {
  dither: "bayer",
  shape: "box",
  sampleStep: 4,
  particleSize: 1.8,
  threshold: 139,
  colorMode: "mono",
  backgroundColor: "#000000",
  particleColor: "#ffffff",
  black: 0,
  mid: 3.5,
  white: 176,
  ditherBackground: true,
  tiltStrength: 1.95,
  pointerTilt: true,
  posX: 0,
  posY: 0,
  posZ: 0,
  rotXDeg: 0,
  rotYDeg: 0,
  rotZDeg: 0,
} as const;

export function DitherViewer() {
  return (
    <div style={{ width: "100%", aspectRatio: "900 / 620" }}>
      <ModelDither
        modelUrl="/ethereum_3d_logo.glb"
        width="100%"
        height="100%"
        dither={PRESET.dither}
        shape={PRESET.shape}
        sampleStep={PRESET.sampleStep}
        particleSize={PRESET.particleSize}
        threshold={PRESET.threshold}
        colorMode={PRESET.colorMode}
        backgroundColor={PRESET.backgroundColor}
        particleColor={PRESET.particleColor}
        black={PRESET.black}
        mid={PRESET.mid}
        white={PRESET.white}
        ditherBackground={PRESET.ditherBackground}
        tiltStrength={PRESET.tiltStrength}
        pointerTilt={PRESET.pointerTilt}
        posX={PRESET.posX}
        posY={PRESET.posY}
        posZ={PRESET.posZ}
        rotXDeg={PRESET.rotXDeg}
        rotYDeg={PRESET.rotYDeg}
        rotZDeg={PRESET.rotZDeg}
      />
    </div>
  );
}`;

type GuideStep = {
  id: string;
  title: string;
  body: string;
  code?: string;
};

const STEPS: GuideStep[] = [
  {
    id: "01",
    title: "Install Package",
    body: "In your target React site, install the dither viewer package first.",
    code: INSTALL_CMD,
  },
  {
    id: "02",
    title: "Open Tool App",
    body: "Run this tool app locally, open it, and tune the dither look until it feels right.",
    code: "npm run dev",
  },
  {
    id: "03",
    title: "Upload GLB",
    body: "Upload your .glb model in the tool. This becomes your source model for the exported viewer.",
  },
  {
    id: "04",
    title: "Replace Model Path",
    body: "In the exported preset/viewer code, replace modelUrl with your deployed asset path (for example /models/my-logo.glb).",
  },
  {
    id: "05",
    title: "Paste Into Site",
    body: "Drop the exported DitherViewer into your production React page and style its container however you want.",
    code: VIEWER_SNIPPET,
  },
];

type DitherPreviewProps = {
  title: string;
  modelUrl: string;
};

function DitherPreview({ title, modelUrl }: DitherPreviewProps) {
  return (
    <aside className="float-window" aria-label={title}>
      <div className="window-bar">
        <span>{title}</span>
        <span className="window-dots" aria-hidden="true">[ ] [ ] [x]</span>
      </div>
      <div className="window-body">
        <div className="window-canvas">
          <ModelDither
            modelUrl={modelUrl}
            width="100%"
            height="100%"
            dither={DEFAULT_PRESET.dither}
            shape={DEFAULT_PRESET.shape}
            sampleStep={DEFAULT_PRESET.sampleStep}
            particleSize={DEFAULT_PRESET.particleSize}
            threshold={DEFAULT_PRESET.threshold}
            colorMode={DEFAULT_PRESET.colorMode}
            backgroundColor={DEFAULT_PRESET.backgroundColor}
            particleColor={DEFAULT_PRESET.particleColor}
            black={DEFAULT_PRESET.black}
            mid={DEFAULT_PRESET.mid}
            white={DEFAULT_PRESET.white}
            ditherBackground={DEFAULT_PRESET.ditherBackground}
            tiltStrength={DEFAULT_PRESET.tiltStrength}
            pointerTilt={DEFAULT_PRESET.pointerTilt}
            posX={DEFAULT_PRESET.posX}
            posY={DEFAULT_PRESET.posY}
            posZ={DEFAULT_PRESET.posZ}
            rotXDeg={DEFAULT_PRESET.rotXDeg}
            rotYDeg={DEFAULT_PRESET.rotYDeg}
            rotZDeg={DEFAULT_PRESET.rotZDeg}
          />
        </div>
      </div>
    </aside>
  );
}

export default function App() {
  const [copied, setCopied] = useState("Ready");
  const [modelUrl, setModelUrl] = useState(DEFAULT_MODEL_URL);
  const [modelName, setModelName] = useState("ethereum_3d_logo.glb");
  const stepRefs = useRef<Array<HTMLElement | null>>([]);
  const [visibleSteps, setVisibleSteps] = useState<boolean[]>(() => STEPS.map((_, index) => index === 0));

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const idx = Number((entry.target as HTMLElement).dataset.index);
          if (!Number.isNaN(idx) && entry.isIntersecting) {
            setVisibleSteps((prev) => {
              if (prev[idx]) return prev;
              const next = [...prev];
              next[idx] = true;
              return next;
            });
          }
        });
      },
      { threshold: 0.45, rootMargin: "-10% 0px -20% 0px" },
    );

    stepRefs.current.forEach((node) => {
      if (node) observer.observe(node);
    });

    return () => observer.disconnect();
  }, []);

  const revealCount = useMemo(() => visibleSteps.filter(Boolean).length, [visibleSteps]);

  const copyText = async (text: string, successLabel: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(successLabel);
      window.setTimeout(() => setCopied("Ready"), 1400);
    } catch {
      setCopied("Clipboard blocked");
    }
  };

  return (
    <main className="retro-page">
      <DitherPreview title="SIGNAL PREVIEW A" modelUrl={modelUrl} />
      <div className="float-bottom-left">
        <DitherPreview title="SIGNAL PREVIEW B" modelUrl={modelUrl} />
      </div>

      <header className="hero-shell">
        <div className="hero-headline">
          <p className="kicker">DITHERKING / MONO GUIDE</p>
          <h1>Export a Dither Viewer into Any React Site</h1>
          <p className="hero-copy">
            Black and white workflow. Tune in the tool, export the viewer, paste into production.
          </p>
        </div>

        <div className="hero-actions">
          <button type="button" onClick={() => copyText(INSTALL_CMD, "npm copied")}>Copy npm install</button>
          <button type="button" onClick={() => copyText(VIEWER_SNIPPET, "viewer snippet copied")}>Copy quick snippet</button>
          <small>Status: {copied}</small>
        </div>
      </header>

      <section className="upload-box">
        <label>
          <span>Optional: upload your own GLB for live preview</span>
          <input
            type="file"
            accept=".glb,model/gltf-binary"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const next = URL.createObjectURL(file);
              setModelUrl(next);
              setModelName(file.name);
            }}
          />
          <small>Current model: {modelName}</small>
        </label>
      </section>

      <section className="progress-strip" aria-label="Guide progress">
        <span>Revealed steps: {revealCount}/{STEPS.length}</span>
      </section>

      <section className="guide-shell">
        {STEPS.map((step, index) => (
          <article
            key={step.id}
            data-index={index}
            ref={(el) => {
              stepRefs.current[index] = el;
            }}
            className={`guide-step ${visibleSteps[index] ? "is-visible" : ""}`}
          >
            <p className="step-index">{step.id}</p>
            <h2>{step.title}</h2>
            <p>{step.body}</p>
            {step.code ? (
              <div className="step-code">
                <pre>{step.code}</pre>
                <button type="button" onClick={() => copyText(step.code ?? "", `${step.id} copied`)}>Copy</button>
              </div>
            ) : null}
          </article>
        ))}
      </section>
    </main>
  );
}
