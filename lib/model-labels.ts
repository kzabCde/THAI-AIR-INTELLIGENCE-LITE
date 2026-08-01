export const MODEL_LABELS: Record<string, string> = {
  "recent-mean-v1": "ค่าเฉลี่ย PM2.5 ย้อนหลัง 7 วัน (Fallback)",
  "persist-revert-v2": "Persistence + Mean-Revert (Legacy)",
  "ewma-diurnal-v1": "EWMA + Diurnal Curve (Legacy)",
  "weighted-ensemble-v1": "Weighted Ensemble (เลิกใช้)",
  "stacking-v1": "Learned Stacking (persist-revert + ML base model)",
  "lightgbm-v1": "LightGBM (feature importance weighted)",
  "xgboost-v1": "XGBoost (legacy)",
  "xgb-lgbm-pm25-nextday-v2": "XGBoost/LightGBM distilled Ridge surrogate",
  "surrogate-v2": "Validated Ridge surrogate",
  "stacking-v2": "Validated stacking ensemble",
  "ensemble6-pm25-v3": "Ensemble 6 โมเดล: RF, AdaBoost, GBM, XGBoost, LightGBM และ CatBoost",
  "random-forest-regressor": "Random Forest Regressor",
  "adaboost-regressor": "AdaBoost Regressor",
  "gradient-boosting-regressor": "Gradient Boosting Regressor",
  "xgboost-regressor": "XGBoost Regressor",
  "lightgbm-regressor": "LightGBM Regressor",
  "catboost-regressor": "CatBoost Regressor",
  "random-forest-classifier": "Random Forest Classifier",
  "adaboost-classifier": "AdaBoost Classifier",
  "gradient-boosting-classifier": "Gradient Boosting Classifier",
  "xgboost-classifier": "XGBoost Classifier",
  "lightgbm-classifier": "LightGBM Classifier",
  "catboost-classifier": "CatBoost Classifier",
  "lightgbm-pm25-pooled-v1": "LightGBM พยากรณ์ PM2.5 แบบรวม 20 จังหวัด",
  "random-forest-aqi-classifier-pooled-v1": "Random Forest จัดระดับคุณภาพอากาศแบบรวม 20 จังหวัด",
};

export function getModelLabel(modelName: string): string {
  return MODEL_LABELS[modelName] ?? modelName;
}

export function getModelDisplayName(modelName: string): string {
  const label = MODEL_LABELS[modelName];
  return label ? `${label} (${modelName})` : modelName;
}
