// تكامل Telegram Bot — يرسل الإشعارات إذا تم ضبط المتغيرات في .env
// TELEGRAM_CHAT_ID يدعم أكثر من معرّف مفصولين بفاصلة: "123,456"

export async function sendTelegram(text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatIds = (process.env.TELEGRAM_CHAT_ID || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!token || chatIds.length === 0) return false;

  let anyOk = false;
  for (const chatId of chatIds) {
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: "HTML",
          }),
        }
      );
      if (res.ok) anyOk = true;
    } catch {
      // تجاهل فشل معرّف واحد وتابع الباقي
    }
  }
  return anyOk;
}
