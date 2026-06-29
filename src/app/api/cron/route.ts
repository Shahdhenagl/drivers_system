import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendTelegram } from "@/lib/telegram";
import { treasuryByMethod } from "@/lib/finance";
import { getFinanceOverview } from "@/lib/finance-overview";
import { getDashboardStats } from "@/lib/dashboard";
import { formatShortDate, startOfDay, endOfDay, addDays } from "@/lib/format";
import { formatMoney } from "@/lib/money";

export const dynamic = "force-dynamic";

/**
 * إشعارات مجدولة عبر Telegram.
 * الاستدعاء: GET /api/cron?secret=XXX&type=daily   (قبل موعد الرحلات بيوم)
 *           GET /api/cron?secret=XXX&type=weekly  (الجمعة 12:00 ص — تصفية الخزنة)
 */
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const type = req.nextUrl.searchParams.get("type") ?? "daily";
  let sent = 0;

  if (type === "daily") {
    // رحلات الغد
    const t = addDays(new Date(), 1);
    const trips = await prisma.trip.findMany({
      where: {
        date: { gte: startOfDay(t), lte: endOfDay(t) },
        status: { not: "CANCELLED" },
      },
      include: { contractor: true, driver: true },
      orderBy: { time: "asc" },
    });

    for (const trip of trips) {
      const msg = [
        "🚛 <b>تذكير برحلة الغد</b>",
        `📅 ${formatShortDate(trip.date)}${trip.time ? " - " + trip.time : ""}`,
        `👤 المقاول: ${trip.contractor.name}`,
        `🚚 السواق: ${trip.driver?.name ?? "غير محدد"}`,
        `📍 من: ${trip.startPoint}`,
        `🏁 إلى: ${trip.endPoint}`,
        `💰 قيمة المقاول: ${formatMoney(trip.contractorPrice)}`,
        `💵 مستحق السواق: ${formatMoney(trip.driverDue)}`,
      ].join("\n");
      if (await sendTelegram(msg)) sent++;
    }
    return NextResponse.json({ ok: true, type, trips: trips.length, sent });
  }

  if (type === "weekly") {
    const [treasury, ov, stats] = await Promise.all([
      treasuryByMethod(),
      getFinanceOverview(),
      getDashboardStats(),
    ]);
    const msg = [
      "📊 <b>التقرير الأسبوعي — تذكير بتصفية الخزنة</b>",
      "",
      `💼 رصيد الخزنة: ${formatMoney(treasury.total)}`,
      `📈 الإيرادات (الإجمالية): ${formatMoney(ov.totalRevenue)}`,
      `📉 المصروفات: ${formatMoney(ov.totalExpenses)}`,
      `✅ ربح الأسبوع (صافي): ${formatMoney(stats.profitWeek)}`,
      `🧾 متبقٍ لدى العملاء: ${formatMoney(ov.totalDeferred)}`,
      `🚚 متبقٍ للسواقين: ${formatMoney(ov.totalRemainingDrivers)}`,
      "",
      "🔔 لا تنسَ تصفية الخزنة وتوزيع الأرباح.",
    ].join("\n");
    const ok = await sendTelegram(msg);
    return NextResponse.json({ ok, type, sent: ok ? 1 : 0 });
  }

  return NextResponse.json({ error: "unknown type" }, { status: 400 });
}
