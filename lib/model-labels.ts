export const MODEL_LABELS: Record<string, string> = {
  "persist-revert-v2": "Persistence + Mean-Revert (ค่า 7 วันย้อนหลัง)",
  "ewma-diurnal-v1": "EWMA + Diurnal Curve",
  "weighted-ensemble-v1": "Weighted Ensemble (เลิกใช้)",
  "stacking-v1": "Learned Stacking (persist-revert + ML base model)",
  "lightgbm-v1": "LightGBM (feature importance weighted)",
  "xgboost-v1": "XGBoost (legacy)",
  "xgb-lgbm-pm25-nextday-v2": "XGBoost/LightGBM distilled Ridge surrogate",
  "surrogate-v2": "Validated Ridge surrogate",
  "stacking-v2": "Validated stacking ensemble",
  "ensemble6-pm25-v3": "Ensemble 6 โมเดล: RF, AdaBoost, GBM, XGBoost, LightGBM และ CatBoost",
};

export function getModelLabel(modelName: string): string {
  return MODEL_LABELS[modelName] ?? modelName;
}

export function getModelDisplayName(modelName: string): string {
  const label = MODEL_LABELS[modelName];
  return label ? `${label} (${modelName})` : modelName;
}
