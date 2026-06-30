"use client";

// نظام أصوات خفيف بالـ Web Audio API — بدون ملفات صوت (يعمل أوفلاين كـ PWA).

let ctx: AudioContext | null = null;
const STORAGE_KEY = "sound-enabled";

/** هل الصوت مفعّل؟ (افتراضيًا نعم) */
export function isSoundEnabled(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(STORAGE_KEY) !== "0";
}

/** تفعيل/كتم الصوت مع الحفظ، ويبثّ حدثًا لتحديث الواجهة */
export function setSoundEnabled(on: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
  window.dispatchEvent(new CustomEvent("sound-toggle", { detail: on }));
  if (on) playSound("click");
}

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

type Note = {
  freq: number;
  start: number; // ثانية من بداية الصوت
  dur: number; // مدة النغمة بالثواني
  type?: OscillatorType;
  gain?: number; // ذروة المستوى (0..1)
};

function playNotes(notes: Note[]) {
  if (!isSoundEnabled()) return;
  const ac = getCtx();
  if (!ac) return;
  const now = ac.currentTime;
  for (const n of notes) {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = n.type ?? "sine";
    osc.frequency.value = n.freq;
    const t0 = now + n.start;
    const peak = n.gain ?? 0.14;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.dur);
    osc.connect(g).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + n.dur + 0.03);
  }
}

export type SoundName =
  | "click" // نقر عام خفيف
  | "open" // فتح نافذة/قائمة
  | "success" // تأكيد/إنهاء ناجح
  | "order" // مميز: حفظ/تأكيد طلب جديد
  | "money" // تحصيل/سداد
  | "cancel" // إلغاء
  | "error"; // خطأ

/** تشغيل صوت باسمه */
export function playSound(name: SoundName) {
  switch (name) {
    case "click":
      playNotes([{ freq: 430, start: 0, dur: 0.05, type: "triangle", gain: 0.05 }]);
      break;
    case "open":
      playNotes([{ freq: 560, start: 0, dur: 0.08, type: "sine", gain: 0.06 }]);
      break;
    case "success":
      playNotes([
        { freq: 660, start: 0, dur: 0.12, type: "sine", gain: 0.13 },
        { freq: 988, start: 0.1, dur: 0.18, type: "sine", gain: 0.13 },
      ]);
      break;
    case "order":
      // نغمة مميزة صاعدة (C-E-G-C) — للطلب الجديد
      playNotes([
        { freq: 523, start: 0.0, dur: 0.13, type: "triangle", gain: 0.16 },
        { freq: 659, start: 0.1, dur: 0.13, type: "triangle", gain: 0.16 },
        { freq: 784, start: 0.2, dur: 0.15, type: "triangle", gain: 0.16 },
        { freq: 1047, start: 0.32, dur: 0.3, type: "triangle", gain: 0.18 },
      ]);
      break;
    case "money":
      playNotes([
        { freq: 1318, start: 0.0, dur: 0.07, type: "square", gain: 0.05 },
        { freq: 1760, start: 0.07, dur: 0.13, type: "square", gain: 0.05 },
      ]);
      break;
    case "cancel":
      playNotes([
        { freq: 400, start: 0.0, dur: 0.14, type: "sawtooth", gain: 0.08 },
        { freq: 300, start: 0.12, dur: 0.2, type: "sawtooth", gain: 0.08 },
      ]);
      break;
    case "error":
      playNotes([
        { freq: 220, start: 0.0, dur: 0.16, type: "square", gain: 0.08 },
        { freq: 165, start: 0.15, dur: 0.22, type: "square", gain: 0.08 },
      ]);
      break;
  }
}
