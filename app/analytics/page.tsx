import { Card } from "@/components/ui/card";
import { calculateRisk, RISK_EXAMPLES } from "@/lib/risk/calculate-risk";

export default function AnalyticsPage() {
  const scenario = calculateRisk({ pm25: 52, pm10: 90, aqi: 138, windSpeed: 6, humidity: 78, temperature: 35, isStale: false });

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="text-xl font-semibold">วิเคราะห์ความเสี่ยง</h2>
        <p className="mt-2 text-sm text-slate-500">สรุปจาก Risk Engine (Demo): {scenario.thaiLabel} ({scenario.riskScore}) • confidence {scenario.confidence}%</p>
        <p className="mt-2 text-sm">{scenario.explanation}</p>
      </Card>
      <Card>
        <h3 className="font-semibold">Sample cases</h3>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Low case: {RISK_EXAMPLES.low.thaiLabel} ({RISK_EXAMPLES.low.riskScore})</p>
        <p className="text-sm text-slate-600 dark:text-slate-300">High case: {RISK_EXAMPLES.high.thaiLabel} ({RISK_EXAMPLES.high.riskScore})</p>
      </Card>
    </div>
  );
}
