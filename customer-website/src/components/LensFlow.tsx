"use client";

import { useMemo, useState } from "react";
import type { Lens, LensType, Prescription, RxEye } from "@/lib/api-types";
import { newLineId, type BagLine } from "@/lib/bag";
import { money, type MoneyFormat } from "@/lib/format";
import { ADD_VALUES, CYL_VALUES, emptyEye, GLASSES_TYPES, lensCopy, lensesOfType, PD_VALUES, RX_MODES, rxModeLabel, rxProblems, SPH_VALUES, type GlassesType } from "@/lib/lens";
import { Drawer } from "./Drawer";

type Step = "type" | "lens" | "rx" | "review";

export interface FrameChoice {
  slug: string;
  name: string;
  categoryKind: string;
  variantId: string;
  variantLabel: string;
  colourKey: string | null;
  colourLabel: string;
  priceCents: number;
}

function EyeRow({ label, eye, onChange, showAdd }: { label: string; eye: RxEye; onChange: (e: RxEye) => void; showAdd: boolean }) {
  const id = label.toLowerCase().replace(/\W+/g, "-");
  return (
    <>
      <span style={{ fontWeight: 500 }}>{label}</span>
      <select className="select" aria-label={`${label} sphere (SPH)`} value={eye.sph} onChange={(e) => onChange({ ...eye, sph: e.target.value })}>
        {SPH_VALUES.map((v) => (
          <option key={v} value={v}>
            {v === "0.00" ? "0.00 (plano)" : v}
          </option>
        ))}
      </select>
      <select className="select" aria-label={`${label} cylinder (CYL)`} value={eye.cyl ?? ""} onChange={(e) => onChange({ ...eye, cyl: e.target.value || null, axis: e.target.value ? eye.axis : null })}>
        <option value="">None</option>
        {CYL_VALUES.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
      <input
        id={`${id}-axis`}
        className="input"
        inputMode="numeric"
        aria-label={`${label} axis`}
        placeholder={eye.cyl ? "0–180" : "—"}
        disabled={!eye.cyl}
        value={eye.axis ?? ""}
        onChange={(e) => onChange({ ...eye, axis: e.target.value.replace(/\D/g, "").slice(0, 3) || null })}
      />
      {showAdd ? (
        <select className="select" aria-label={`${label} addition (ADD)`} value={eye.add ?? ""} onChange={(e) => onChange({ ...eye, add: e.target.value || null })}>
          <option value="">—</option>
          {ADD_VALUES.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      ) : (
        <span className="muted" aria-hidden="true">
          —
        </span>
      )}
    </>
  );
}

/** Lens selection for one frame: glasses type → lens option → prescription → review → bag. */
export function LensFlow({ open, onClose, frame, lenses, fmt, onAdd }: { open: boolean; onClose: () => void; frame: FrameChoice; lenses: Lens[]; fmt: MoneyFormat; onAdd: (line: BagLine) => void }) {
  const [step, setStep] = useState<Step>("type");
  const [type, setType] = useState<GlassesType | null>(null);
  const [lens, setLens] = useState<Lens | null>(null);
  const [rx, setRx] = useState<Prescription>({ mode: "send_later" });
  const [showProblems, setShowProblems] = useState(false);

  const ofType = (t: LensType) => lensesOfType(lenses, t);
  const steps: Step[] = useMemo(() => {
    if (!type || type === "frame_only") return ["type", "review"];
    return ofType(type).length > 1 ? ["type", "lens", "rx", "review"] : ["type", "rx", "review"];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, lenses]);
  const index = steps.indexOf(step);
  const needsAdd = type === "progressive" || type === "bifocal";
  const problems = step === "rx" ? rxProblems(rx, needsAdd) : [];
  const total = frame.priceCents + (lens?.priceCents ?? 0);

  function chooseType(t: GlassesType) {
    setType(t);
    if (t === "frame_only") setLens(null);
    else {
      const options = ofType(t);
      setLens((cur) => (cur && cur.type === t ? cur : (options[0] ?? null)));
    }
  }
  function next() {
    if (step === "rx" && problems.length) {
      setShowProblems(true);
      return;
    }
    setShowProblems(false);
    if (step === "review") {
      onAdd({
        id: newLineId(),
        slug: frame.slug,
        name: frame.name,
        categoryKind: frame.categoryKind,
        variantId: frame.variantId,
        variantLabel: frame.variantLabel,
        colourKey: frame.colourKey,
        quantity: 1,
        unitPriceCents: frame.priceCents,
        lens: lens && type !== "frame_only" ? { variantId: lens.variantId, name: lens.name, title: `${GLASSES_TYPES.find((g) => g.key === type)?.title ?? ""} · ${lensCopy(lens).title}`, type: lens.type, priceCents: lens.priceCents } : null,
        prescription: lens && type !== "frame_only" ? (rx.mode === "enter" ? rx : { mode: rx.mode }) : null,
        eye: null,
      });
      reset();
      return;
    }
    setStep(steps[index + 1]);
  }
  function back() {
    setShowProblems(false);
    if (index > 0) setStep(steps[index - 1]);
  }
  function reset() {
    setStep("type");
    setType(null);
    setLens(null);
    setRx({ mode: "send_later" });
  }
  const canNext = step === "type" ? Boolean(type && (type === "frame_only" || lens)) : step === "lens" ? Boolean(lens) : true;
  const titles: Record<Step, string> = { type: "Choose your glasses", lens: "Choose your lenses", rx: "Your prescription", review: "Review" };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`${frame.name} · ${frame.colourLabel}`}
      onBack={index > 0 ? back : null}
      progress={(index + 1) / steps.length}
      footer={
        <>
          <div className="subtotal">
            Subtotal
            <strong className="num">{money(total, fmt)}</strong>
          </div>
          <button type="button" className="btn btn--primary" onClick={next} disabled={!canNext}>
            {step === "review" ? "Add to bag" : "Next"}
          </button>
        </>
      }
    >
      <h3>{titles[step]}</h3>

      {step === "type" ? (
        <>
          <p className="step-intro">Prices are for the pair of lenses, on top of the frame.</p>
          <div className="options__group">
            <p className="options__label">With prescription</p>
            <div className="options" role="radiogroup" aria-label="Glasses with prescription">
              {GLASSES_TYPES.filter((g) => g.rx).map((g) => {
                const options = ofType(g.key as LensType);
                const from = options.length ? Math.min(...options.map((l) => l.priceCents)) : null;
                return (
                  <button key={g.key} type="button" role="radio" aria-checked={type === g.key} className={`option${type === g.key ? " is-selected" : ""}${from === null ? " is-disabled" : ""}`} disabled={from === null} onClick={() => chooseType(g.key)}>
                    <span className="option__head">
                      <span>{g.title}</span>
                      <span className="option__price">{from === null ? "Not available" : `${options.length > 1 ? "from " : ""}+${money(from, fmt)}`}</span>
                    </span>
                    <span className="option__body" style={{ display: "block" }}>
                      {g.body}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="options__group">
            <p className="options__label">Without prescription</p>
            <div className="options" role="radiogroup" aria-label="Glasses without prescription">
              {GLASSES_TYPES.filter((g) => !g.rx).map((g) => (
                <button key={g.key} type="button" role="radio" aria-checked={type === g.key} className={`option${type === g.key ? " is-selected" : ""}`} onClick={() => chooseType(g.key)}>
                  <span className="option__head">
                    <span>{g.title}</span>
                    <span className="option__price">+{money(0, fmt)}</span>
                  </span>
                  <span className="option__body" style={{ display: "block" }}>
                    {g.body}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </>
      ) : null}

      {step === "lens" && type && type !== "frame_only" ? (
        <>
          <p className="step-intro">All lenses are made to your prescription at our partner laboratory.</p>
          <div className="options" role="radiogroup" aria-label="Lens options">
            {ofType(type).map((l) => {
              const copy = lensCopy(l);
              return (
                <button key={l.variantId} type="button" role="radio" aria-checked={lens?.variantId === l.variantId} className={`option${lens?.variantId === l.variantId ? " is-selected" : ""}`} onClick={() => setLens(l)}>
                  <span className="option__head">
                    <span>{copy.title}</span>
                    <span className="option__price">+{money(l.priceCents, fmt)}</span>
                  </span>
                  <span className="option__body" style={{ display: "block" }}>
                    {copy.body}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      ) : null}

      {step === "rx" ? (
        <>
          <p className="step-intro">Our optometrist checks every prescription before your lenses are ordered.</p>
          <div className="options" role="radiogroup" aria-label="How you'll give us your prescription">
            {RX_MODES.map((m) => (
              <button key={m.key} type="button" role="radio" aria-checked={rx.mode === m.key} className={`option${rx.mode === m.key ? " is-selected" : ""}`} onClick={() => setRx(m.key === "enter" ? { mode: "enter", od: rx.od ?? emptyEye(), os: rx.os ?? emptyEye(), pd: rx.pd ?? null, issuedOn: rx.issuedOn ?? null } : { mode: m.key })}>
                <span className="option__head">
                  <span>{m.title}</span>
                </span>
                <span className="option__body" style={{ display: "block" }}>
                  {m.body}
                </span>
              </button>
            ))}
          </div>
          {rx.mode === "enter" && rx.od && rx.os ? (
            <div style={{ marginTop: 26, display: "grid", gap: 18 }}>
              <div className="rx-table" role="group" aria-label="Prescription values">
                <span />
                <span className="head">SPH</span>
                <span className="head">CYL</span>
                <span className="head">AXIS</span>
                <span className="head">ADD</span>
                <EyeRow label="Right (OD)" eye={rx.od} onChange={(od) => setRx({ ...rx, od })} showAdd={needsAdd} />
                <EyeRow label="Left (OS)" eye={rx.os} onChange={(os) => setRx({ ...rx, os })} showAdd={needsAdd} />
              </div>
              <div className="form-grid form-grid--2">
                <div className="field">
                  <label htmlFor="rx-pd">Pupillary distance (PD)</label>
                  <select id="rx-pd" className="select" value={rx.pd ?? ""} onChange={(e) => setRx({ ...rx, pd: e.target.value || null })}>
                    <option value="">I don&apos;t know (measure at pickup)</option>
                    {PD_VALUES.map((v) => (
                      <option key={v} value={v}>
                        {v} mm
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="rx-date">Prescription date</label>
                  <input id="rx-date" type="date" className="input" value={rx.issuedOn ?? ""} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setRx({ ...rx, issuedOn: e.target.value || null })} />
                </div>
              </div>
              <p className="muted" style={{ fontSize: 13.5 }}>
                OD is your right eye and OS your left. Leave CYL as &ldquo;None&rdquo; if your prescription doesn&apos;t list one.
              </p>
              {showProblems && problems.length ? (
                <div className="notice notice--error" role="alert">
                  {problems.map((p) => (
                    <p key={p}>{p}</p>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}

      {step === "review" ? (
        <dl className="review">
          <div>
            <dt>
              {frame.name} · {frame.variantLabel}
            </dt>
            <dd>{money(frame.priceCents, fmt)}</dd>
          </div>
          {lens && type !== "frame_only" ? (
            <>
              <div>
                <dt>
                  {GLASSES_TYPES.find((g) => g.key === type)?.title} lenses · {lensCopy(lens).title}
                </dt>
                <dd>{money(lens.priceCents, fmt)}</dd>
              </div>
              <div>
                <dt>Prescription</dt>
                <dd>{rxModeLabel(rx.mode)}</dd>
              </div>
            </>
          ) : (
            <div>
              <dt>Lenses</dt>
              <dd>Non-prescription demo lenses</dd>
            </div>
          )}
          <div>
            <dt>Collection</dt>
            <dd>In branch, chosen at checkout</dd>
          </div>
        </dl>
      ) : null}
    </Drawer>
  );
}
