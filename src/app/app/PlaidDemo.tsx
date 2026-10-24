"use client";

import { useState } from "react";

// A clickable walkthrough of the bank-linked experience, on static sample
// data. Nothing here touches the API. Opened from the footer "Plaid demo" link.

const G = "#065f46", GM = "#047857", GS = "#a7f3d0", GB = "#ecfdf5", GL = "#d1fae5";
const INK = "#1e293b", MUTED = "#64748b", FAINT = "#94a3b8", LINE = "#e2e8f0", RED = "#dc2626";

function Check({ color = GM, size = 18 }: { color?: string; size?: number }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>;
}
function Chevron() {
  return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={GM} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>;
}

const STEPS = ["Link", "Today", "Sort", "Changed", "Calendar"] as const;

export default function PlaidDemo({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [found, setFound] = useState<Record<string, boolean>>({ Paycheck: true, Rent: true, "Car payment": true, Groceries: true, Netflix: true, "Dog walker": true, Amazon: false });
  const [sortPick, setSortPick] = useState<string | null>(null);
  const [rentPick, setRentPick] = useState<string | null>(null);
  const [moved, setMoved] = useState(false);
  const rent = rentPick === "future" ? 1925 : 1850;
  const groceriesLeft = sortPick === "groceries" ? 96 : 180;

  const row = (day: string, name: string, amt: string, bal: string, neg = false, sub?: string, cleared = false) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 16px", opacity: cleared ? 0.65 : 1, borderBottom: `1px solid #f1f5f9` }}>
      <span style={{ width: 46, fontSize: 12, fontWeight: 700, color: cleared ? MUTED : INK }}>{day}</span>
      <span style={{ flex: 1, fontSize: 13, display: "flex", flexDirection: "column" }}><span>{name}</span>{sub && <span style={{ fontSize: 10, color: FAINT }}>{sub}</span>}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: cleared ? MUTED : amt.startsWith("+") ? GM : RED }}>{amt}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: neg ? RED : GM, width: 52, textAlign: "right" }}>{bal}</span>
    </div>
  );

  const screen = (() => {
    if (step === 0) return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <div style={{ padding: "22px 22px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: GM, textTransform: "uppercase", letterSpacing: "0.08em" }}>Bank linked · Chase Checking ····4821</span>
          <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.15 }}>We found your rhythm. Confirm what repeats.</span>
          <span style={{ fontSize: 13, color: "#475569", lineHeight: 1.5 }}>Ninety days of history, sorted. Nothing to type. Untick anything that should not be in the plan.</span>
        </div>
        <div style={{ padding: "6px 16px", display: "flex", flexDirection: "column", gap: 7, flex: 1, overflowY: "auto" }}>
          {[
            ["Paycheck", "Every other Friday · last 3 on time", "+$4,500"],
            ["Rent", "1st of the month · $1,850, then $1,925 in Oct", "$1,925"],
            ["Car payment", "5th of the month · Toyota Financial", "$420"],
            ["Groceries", "Weekly, mostly Thursdays · Publix, Costco", "~$180"],
            ["Netflix", "8th of the month", "$16"],
            ["Dog walker", "Every Saturday · Venmo", "$100"],
            ["Amazon", "Irregular · 6 charges in 90 days, $23 to $140", "varies"],
          ].map(([name, sub, amt]) => (
            <label key={name} style={{ display: "flex", alignItems: "center", gap: 10, background: "#fff", border: `1px ${name === "Amazon" ? "dashed #cbd5e1" : `solid ${LINE}`}`, borderRadius: 12, padding: "9px 12px", cursor: "pointer" }}>
              <input type="checkbox" checked={!!found[name]} onChange={(e) => setFound((f) => ({ ...f, [name]: e.target.checked }))} style={{ width: 18, height: 18, accentColor: G, margin: 0 }} />
              <span style={{ flex: 1, display: "flex", flexDirection: "column" }}><span style={{ fontSize: 13, fontWeight: 600 }}>{name}</span><span style={{ fontSize: 11, color: MUTED }}>{sub}</span></span>
              <span style={{ fontSize: 13, fontWeight: 700, color: amt.startsWith("+") ? GM : amt === "varies" ? FAINT : RED }}>{amt}</span>
            </label>
          ))}
        </div>
        <div style={{ padding: "10px 16px 18px", display: "flex", flexDirection: "column", gap: 6 }}>
          <button onClick={() => setStep(1)} className="bf-btn" style={{ background: G, color: "#fff", border: "none", borderRadius: 12, padding: "14px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Looks right. Build my calendar</button>
          <span style={{ fontSize: 11, color: FAINT, textAlign: "center" }}>{Object.values(found).filter(Boolean).length} recurring items confirmed</span>
        </div>
      </div>
    );
    if (step === 1) return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <div style={{ background: G, padding: "22px 20px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>flowycash</span>
            <span style={{ fontSize: 11, color: GS, display: "flex", alignItems: "center", gap: 5 }}><Check color="#6ee7b7" size={11} />Bank synced 6:12 AM</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: GS, textTransform: "uppercase", letterSpacing: "0.08em" }}>Safe to spend until Friday</span>
            <span style={{ fontSize: 44, fontWeight: 800, color: "#fff", letterSpacing: "-0.04em", lineHeight: 1 }}>$412</span>
            <span style={{ fontSize: 12, color: GL, marginTop: 4 }}>Checking is $2,174. Rent, car payment and groceries are already set aside.</span>
          </div>
        </div>
        <div style={{ padding: "14px 14px 0", display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
          <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 14, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 13, fontWeight: 700 }}>Overnight</span><span style={{ fontSize: 11, fontWeight: 600, color: GM }}>All matched your plan</span></div>
            {[["Netflix", "$16.00", MUTED], ["Shell", "$53.40", MUTED], ["Paycheck", "+$4,500.00", GM]].map(([n, a, c]) => (
              <div key={n} style={{ display: "flex", alignItems: "center", gap: 10 }}><Check size={15} /><span style={{ flex: 1, fontSize: 13 }}>{n}</span><span style={{ fontSize: 13, fontWeight: 600, color: c }}>{a}</span></div>
            ))}
          </div>
          <button onClick={() => setStep(2)} className="bf-btn" style={{ textAlign: "left", background: "#fff", border: `1.5px solid #10b981`, borderRadius: 14, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12, color: INK, cursor: "pointer", fontFamily: "inherit" }}>
            <span style={{ width: 30, height: 30, borderRadius: "50%", background: GL, color: G, fontSize: 14, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>1</span>
            <span style={{ flex: 1, display: "flex", flexDirection: "column" }}><span style={{ fontSize: 13, fontWeight: 700 }}>One thing to sort</span><span style={{ fontSize: 11, color: MUTED }}>Publix, $84.12. Takes ten seconds.</span></span>
            <Chevron />
          </button>
          <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 14, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 7 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>Next up</span>
            {[["Fri", "Car insurance", "$135"], ["Sat", "Dog walker", "$100"], ["Nov 1", "Rent", `$${rent.toLocaleString()}`]].map(([d, n, a]) => (
              <div key={n} style={{ display: "flex", alignItems: "center", gap: 10 }}><span style={{ width: 36, fontSize: 11, fontWeight: 700, color: MUTED }}>{d}</span><span style={{ flex: 1, fontSize: 13 }}>{n}</span><span style={{ fontSize: 13, fontWeight: 600, color: RED }}>{a}</span></div>
            ))}
          </div>
        </div>
      </div>
    );
    if (step === 2) return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "18px 16px" , gap: 14 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: MUTED, textAlign: "center" }}>1 of 1 to sort</span>
        <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 16, padding: "18px", display: "flex", flexDirection: "column", gap: 4, boxShadow: "0 10px 30px rgba(15,23,42,0.06)" }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: MUTED, textTransform: "uppercase", letterSpacing: "0.08em" }}>Yesterday · Checking</span>
          <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.03em" }}>Publix</span>
          <span style={{ fontSize: 22, fontWeight: 700, color: RED }}>$84.12</span>
          <span style={{ fontSize: 13, color: "#475569", lineHeight: 1.5, marginTop: 6 }}>Your plan has groceries on Thursdays for about $180. This one is smaller and landed on a Tuesday.</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: MUTED, paddingLeft: 4 }}>What is it?</span>
          {[
            ["groceries", "Part of this week's groceries", "Thursday's $180 becomes $96 remaining"],
            ["oneoff", "A one-off", "Added to Tuesday, groceries. Plan unchanged."],
            ["new", "Something new that repeats", "We'll ask how often and add it to the calendar"],
          ].map(([k, t, s]) => {
            const on = sortPick === k || (sortPick === null && k === "groceries");
            return (
              <button key={k} onClick={() => { setSortPick(k); setTimeout(() => setStep(3), 350); }} className="bf-btn"
                style={{ textAlign: "left", background: on ? G : "#fff", color: on ? "#fff" : INK, border: on ? "none" : `1.5px solid ${LINE}`, borderRadius: 12, padding: "12px 14px", fontFamily: "inherit", display: "flex", flexDirection: "column", gap: 2, cursor: "pointer" }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{t}</span><span style={{ fontSize: 11, color: on ? GS : MUTED }}>{s}</span>
              </button>
            );
          })}
        </div>
        <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 8, background: GB, border: `1px solid ${GS}`, borderRadius: 10, padding: "10px 12px" }}>
          <Check size={15} /><span style={{ fontSize: 12, color: G, lineHeight: 1.4 }}>Whatever you pick, your balance is already right. This only shapes next week&rsquo;s forecast.</span>
        </div>
      </div>
    );
    if (step === 3) return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "18px 16px", gap: 14 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: MUTED, textAlign: "center" }}>Nov 1 · Morning</span>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1 }}>Rent went up.</span>
          <span style={{ fontSize: 13, color: "#475569", lineHeight: 1.5 }}>The bank paid $1,925 this morning. Your plan said $1,850. No surprise on your balance; it already shows the real number. The only question is next month.</span>
        </div>
        <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 16, padding: "14px 16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div style={{ display: "flex", flexDirection: "column" }}><span style={{ fontSize: 10, fontWeight: 700, color: FAINT, textTransform: "uppercase", letterSpacing: "0.08em" }}>Your plan</span><span style={{ fontSize: 20, fontWeight: 700, color: FAINT, textDecoration: "line-through" }}>$1,850</span></div>
          <div style={{ display: "flex", flexDirection: "column" }}><span style={{ fontSize: 10, fontWeight: 700, color: G, textTransform: "uppercase", letterSpacing: "0.08em" }}>Bank</span><span style={{ fontSize: 20, fontWeight: 800 }}>$1,925</span></div>
          <div style={{ gridColumn: "span 2", borderTop: "1px solid #f1f5f9", paddingTop: 8, display: "flex", justifyContent: "space-between", fontSize: 12 }}><span style={{ color: MUTED }}>Difference each month</span><span style={{ fontWeight: 700, color: RED }}>+$75</span></div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            ["future", "Yes, $1,925 from now on", "Lowest point this month moves from $412 to $337. Still fine."],
            ["once", "Just this once", "Keep $1,850 in the plan. We'll ask again if it repeats."],
          ].map(([k, t, s]) => {
            const on = rentPick === k || (rentPick === null && k === "future");
            return (
              <button key={k} onClick={() => { setRentPick(k); setTimeout(() => setStep(4), 350); }} className="bf-btn"
                style={{ textAlign: "left", background: on ? G : "#fff", color: on ? "#fff" : INK, border: on ? "none" : `1.5px solid ${LINE}`, borderRadius: 12, padding: "12px 14px", fontFamily: "inherit", display: "flex", flexDirection: "column", gap: 2, cursor: "pointer" }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{t}</span><span style={{ fontSize: 11, color: on ? GS : MUTED }}>{s}</span>
              </button>
            );
          })}
        </div>
        <div style={{ marginTop: "auto", fontSize: 12, color: "#475569", background: "#fff", border: `1px solid ${LINE}`, borderRadius: 10, padding: "10px 12px" }}>Caught on day one, not at the end of the month. That is the point.</div>
      </div>
    );
    const today = 2174;
    const afterCar = today - 135;
    const afterDog = moved ? afterCar : afterCar - 100;
    const afterGroc = afterDog - groceriesLeft;
    const afterRent = afterGroc - rent;
    const money = (v: number) => `${v < 0 ? "-" : ""}$${Math.abs(v).toLocaleString()}`;
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <div style={{ background: G, padding: "20px 18px 14px" }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#fff", letterSpacing: "-0.03em" }}>October</div>
          <div style={{ fontSize: 11, color: GS, marginTop: 4 }}>Past days are what the bank says. Future days are your plan.</div>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          <div style={{ padding: "8px 16px 2px", fontSize: 10, fontWeight: 700, color: FAINT, textTransform: "uppercase", letterSpacing: "0.08em" }}>Cleared</div>
          {row("Tue 21", "Publix", "$84.12", "$2,259", false, sortPick === "oneoff" ? "sorted: one-off" : "sorted: this week's groceries", true)}
          {row("Wed 22", "Netflix", "$16.00", "$2,243", false, "matched plan exactly", true)}
          {row("Thu 23", "Shell", "$53.40", "$2,190", false, "plan said $55, bank said $53.40", true)}
          <div style={{ margin: "8px 14px", background: "#fff", border: "1.5px solid #10b981", borderRadius: 12, padding: "10px 12px", fontSize: 12, color: "#475569" }}><strong style={{ color: G }}>Fri 24 · Today.</strong> Bank balance <strong style={{ color: INK }}>$2,174</strong>, synced 6:12 AM. Forecast starts here.</div>
          <div style={{ padding: "6px 16px 2px", fontSize: 10, fontWeight: 700, color: FAINT, textTransform: "uppercase", letterSpacing: "0.08em" }}>Planned</div>
          {row("Fri 24", "Car insurance", "$135", money(afterCar))}
          {!moved && row("Sat 25", "Dog walker", "$100", money(afterDog))}
          {row("Thu 30", "Groceries", `$${groceriesLeft}`, money(afterGroc), afterGroc < 0, sortPick === "groceries" ? "$96 left after Tuesday's Publix" : undefined)}
          {row("Nov 1", "Rent", `$${rent.toLocaleString()}`, money(afterRent), afterRent < 0)}
          {row("Nov 2", "Paycheck", "+$4,500", money(afterRent + 4500))}
          {moved && row("Nov 3", "Dog walker", "$100", money(afterRent + 4400), false, "moved to after payday")}
          {!moved && afterRent < 0 && (
            <div style={{ margin: "8px 14px", background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 10, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 12, color: "#9a3412", lineHeight: 1.4, flex: 1 }}>Dips to {money(afterRent)} on Nov 1 until payday on the 2nd. Moving the dog walker to the 3rd {afterRent + 100 >= 0 ? "keeps you above zero" : "gets you most of the way"}.</span>
              <button onClick={() => setMoved(true)} className="bf-btn" style={{ background: "#fff", border: "1px solid #fdba74", borderRadius: 8, padding: "6px 10px", fontFamily: "inherit", fontSize: 12, fontWeight: 700, color: "#9a3412", cursor: "pointer", whiteSpace: "nowrap" }}>Move it</button>
            </div>
          )}
          {moved && (
            <div style={{ margin: "8px 14px", background: afterRent >= 0 ? GB : "#fff7ed", border: `1px solid ${afterRent >= 0 ? GS : "#fed7aa"}`, borderRadius: 10, padding: "10px 12px", fontSize: 12, color: afterRent >= 0 ? G : "#9a3412", display: "flex", gap: 8, alignItems: "center" }}>
              {afterRent >= 0 ? <><Check size={14} />Moved. You stay above zero through payday.</> : <>Moved. Still {money(afterRent)} on Nov 1; set aside {money(-afterRent)} before then or move one more item.</>}
            </div>
          )}
        </div>
      </div>
    );
  })();

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.72)", backdropFilter: "blur(8px)", zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, animation: "panelIn 0.18s ease" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", gap: 28, alignItems: "center", maxWidth: "100%", flexWrap: "wrap", justifyContent: "center" }}>
        <div style={{ color: "#fff", width: 280, display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: GS, textTransform: "uppercase", letterSpacing: "0.1em" }}>Preview · bank-linked Flowy Cash</span>
          <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1 }}>Know, don&rsquo;t worry.</span>
          <span style={{ fontSize: 13, color: "#cbd5e1", lineHeight: 1.5 }}>The bank reconciles the past every night. The calendar forecasts the future. You answer one question a day. Sample data; nothing here is saved.</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
            {STEPS.map((s, i) => (
              <button key={s} onClick={() => setStep(i)} className="bf-btn" style={{ textAlign: "left", background: i === step ? "rgba(255,255,255,0.14)" : "transparent", border: "none", borderRadius: 8, padding: "7px 10px", color: i === step ? "#fff" : "#94a3b8", fontFamily: "inherit", fontSize: 13, fontWeight: i === step ? 700 : 500, cursor: "pointer", display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ width: 20, height: 20, borderRadius: "50%", background: i === step ? "#10b981" : "rgba(255,255,255,0.15)", color: "#fff", fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</span>{s}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} className="bf-btn" style={{ border: "1px solid rgba(255,255,255,0.3)", background: "transparent", color: "#fff", borderRadius: 8, padding: "8px 14px", fontFamily: "inherit", fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: step === 0 ? 0.4 : 1 }}>Back</button>
            <button onClick={() => (step < STEPS.length - 1 ? setStep(step + 1) : onClose())} className="bf-btn" style={{ border: "none", background: "#10b981", color: "#fff", borderRadius: 8, padding: "8px 14px", fontFamily: "inherit", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{step < STEPS.length - 1 ? "Next" : "Close"}</button>
            <button onClick={onClose} className="bf-btn" style={{ marginLeft: "auto", border: "none", background: "transparent", color: "#94a3b8", fontFamily: "inherit", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Exit</button>
          </div>
        </div>
        <div style={{ width: 340, height: 640, maxHeight: "92vh", background: "#f8fafc", borderRadius: 36, border: "9px solid #0f172a", boxSizing: "border-box", overflow: "hidden", boxShadow: "0 30px 80px rgba(0,0,0,0.5)", color: INK, fontFamily: "inherit" }}>
          {screen}
        </div>
      </div>
    </div>
  );
}
