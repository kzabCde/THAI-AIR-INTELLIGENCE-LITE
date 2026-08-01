// Auto-generated from the live Supabase project (Isan Air Quality).
// Regenerate after every applied production migration.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      air_quality_hourly: {
        Row: {
          aqi: number | null
          aqi_category: string | null
          created_at: string | null
          id: number
          observed_at: string
          pm10: number | null
          pm25: number | null
          province_id: string
          source: string
          station_id: string | null
        }
        Insert: {
          aqi?: number | null
          aqi_category?: string | null
          created_at?: string | null
          id?: number
          observed_at: string
          pm10?: number | null
          pm25?: number | null
          province_id: string
          source?: string
          station_id?: string | null
        }
        Update: {
          aqi?: number | null
          aqi_category?: string | null
          created_at?: string | null
          id?: number
          observed_at?: string
          pm10?: number | null
          pm25?: number | null
          province_id?: string
          source?: string
          station_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "air_quality_hourly_province_id_fkey"
            columns: ["province_id"]
            isOneToOne: false
            referencedRelation: "isan_provinces"
            referencedColumns: ["province_id"]
          },
        ]
      }
      backfill_checkpoints: {
        Row: {
          batch_date: string
          completed_at: string | null
          created_at: string | null
          error_msg: string | null
          id: number
          province_id: string | null
          records_saved: number | null
          source: string
          started_at: string | null
          status: string
        }
        Insert: {
          batch_date: string
          completed_at?: string | null
          created_at?: string | null
          error_msg?: string | null
          id?: number
          province_id?: string | null
          records_saved?: number | null
          source: string
          started_at?: string | null
          status?: string
        }
        Update: {
          batch_date?: string
          completed_at?: string | null
          created_at?: string | null
          error_msg?: string | null
          id?: number
          province_id?: string | null
          records_saved?: number | null
          source?: string
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "backfill_checkpoints_province_id_fkey"
            columns: ["province_id"]
            isOneToOne: false
            referencedRelation: "isan_provinces"
            referencedColumns: ["province_id"]
          },
        ]
      }
      cron_log: {
        Row: {
          duration_ms: number | null
          error_msg: string | null
          finished_at: string | null
          id: number
          job_name: string
          meta: Json | null
          records_in: number | null
          records_out: number | null
          started_at: string
          status: string
        }
        Insert: {
          duration_ms?: number | null
          error_msg?: string | null
          finished_at?: string | null
          id?: number
          job_name: string
          meta?: Json | null
          records_in?: number | null
          records_out?: number | null
          started_at?: string
          status?: string
        }
        Update: {
          duration_ms?: number | null
          error_msg?: string | null
          finished_at?: string | null
          id?: number
          job_name?: string
          meta?: Json | null
          records_in?: number | null
          records_out?: number | null
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      daily_summary: {
        Row: {
          aqi_max: number | null
          aqi_mean: number | null
          cloud_cover_mean: number | null
          created_at: string | null
          date: string
          day_of_week: number | null
          hotspot_count: number | null
          hotspot_roll3: number | null
          hotspot_roll7: number | null
          hours_available: number | null
          humidity_mean: number | null
          id: number
          is_burning_season: boolean | null
          is_dry_season: boolean | null
          is_weekend: boolean | null
          month: number | null
          neighbor_pm25_avg: number | null
          neighbor_pm25_max: number | null
          neighbor_pm25_min: number | null
          pm10_mean: number | null
          pm25_lag_1d: number | null
          pm25_lag_3d: number | null
          pm25_lag_7d: number | null
          pm25_max: number | null
          pm25_mean: number | null
          pm25_min: number | null
          pm25_p75: number | null
          pm25_p90: number | null
          pm25_roll14: number | null
          pm25_roll3: number | null
          pm25_roll7: number | null
          pm25_std7: number | null
          precip_roll3: number | null
          precip_roll7: number | null
          precip_total: number | null
          pressure_mean: number | null
          province_id: string
          regional_humidity_avg: number | null
          regional_pm25_avg: number | null
          regional_wind_speed_avg: number | null
          temp_max: number | null
          temp_mean: number | null
          temp_min: number | null
          total_frp: number | null
          updated_at: string | null
          wind_dir_mean: number | null
          wind_speed_max: number | null
          wind_speed_mean: number | null
        }
        Insert: {
          aqi_max?: number | null
          aqi_mean?: number | null
          cloud_cover_mean?: number | null
          created_at?: string | null
          date: string
          day_of_week?: number | null
          hotspot_count?: number | null
          hotspot_roll3?: number | null
          hotspot_roll7?: number | null
          hours_available?: number | null
          humidity_mean?: number | null
          id?: number
          is_burning_season?: boolean | null
          is_dry_season?: boolean | null
          is_weekend?: boolean | null
          month?: number | null
          neighbor_pm25_avg?: number | null
          neighbor_pm25_max?: number | null
          neighbor_pm25_min?: number | null
          pm10_mean?: number | null
          pm25_lag_1d?: number | null
          pm25_lag_3d?: number | null
          pm25_lag_7d?: number | null
          pm25_max?: number | null
          pm25_mean?: number | null
          pm25_min?: number | null
          pm25_p75?: number | null
          pm25_p90?: number | null
          pm25_roll14?: number | null
          pm25_roll3?: number | null
          pm25_roll7?: number | null
          pm25_std7?: number | null
          precip_roll3?: number | null
          precip_roll7?: number | null
          precip_total?: number | null
          pressure_mean?: number | null
          province_id: string
          regional_humidity_avg?: number | null
          regional_pm25_avg?: number | null
          regional_wind_speed_avg?: number | null
          temp_max?: number | null
          temp_mean?: number | null
          temp_min?: number | null
          total_frp?: number | null
          updated_at?: string | null
          wind_dir_mean?: number | null
          wind_speed_max?: number | null
          wind_speed_mean?: number | null
        }
        Update: {
          aqi_max?: number | null
          aqi_mean?: number | null
          cloud_cover_mean?: number | null
          created_at?: string | null
          date?: string
          day_of_week?: number | null
          hotspot_count?: number | null
          hotspot_roll3?: number | null
          hotspot_roll7?: number | null
          hours_available?: number | null
          humidity_mean?: number | null
          id?: number
          is_burning_season?: boolean | null
          is_dry_season?: boolean | null
          is_weekend?: boolean | null
          month?: number | null
          neighbor_pm25_avg?: number | null
          neighbor_pm25_max?: number | null
          neighbor_pm25_min?: number | null
          pm10_mean?: number | null
          pm25_lag_1d?: number | null
          pm25_lag_3d?: number | null
          pm25_lag_7d?: number | null
          pm25_max?: number | null
          pm25_mean?: number | null
          pm25_min?: number | null
          pm25_p75?: number | null
          pm25_p90?: number | null
          pm25_roll14?: number | null
          pm25_roll3?: number | null
          pm25_roll7?: number | null
          pm25_std7?: number | null
          precip_roll3?: number | null
          precip_roll7?: number | null
          precip_total?: number | null
          pressure_mean?: number | null
          province_id?: string
          regional_humidity_avg?: number | null
          regional_pm25_avg?: number | null
          regional_wind_speed_avg?: number | null
          temp_max?: number | null
          temp_mean?: number | null
          temp_min?: number | null
          total_frp?: number | null
          updated_at?: string | null
          wind_dir_mean?: number | null
          wind_speed_max?: number | null
          wind_speed_mean?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_summary_province_id_fkey"
            columns: ["province_id"]
            isOneToOne: false
            referencedRelation: "isan_provinces"
            referencedColumns: ["province_id"]
          },
        ]
      }
      feature_snapshots: {
        Row: {
          created_at: string
          feature_date: string
          feature_version: string
          features: Json
          missingness: Json
          provenance: Json
          province_id: string
          quality_status: string
          snapshot_id: string
          source_latency_seconds: number | null
        }
        Insert: {
          created_at?: string
          feature_date: string
          feature_version: string
          features: Json
          missingness?: Json
          provenance: Json
          province_id: string
          quality_status: string
          snapshot_id?: string
          source_latency_seconds?: number | null
        }
        Update: {
          created_at?: string
          feature_date?: string
          feature_version?: string
          features?: Json
          missingness?: Json
          provenance?: Json
          province_id?: string
          quality_status?: string
          snapshot_id?: string
          source_latency_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "feature_snapshots_province_id_fkey"
            columns: ["province_id"]
            isOneToOne: false
            referencedRelation: "isan_provinces"
            referencedColumns: ["province_id"]
          },
        ]
      }
      forecast_daily: {
        Row: {
          class_agreement: boolean | null
          class_label_en: string | null
          class_label_th: string | null
          class_probabilities: Json | null
          classification_source: string | null
          classifier_model_name: string | null
          classifier_predicted_class: number | null
          classifier_run_id: string | null
          confidence: number | null
          created_at: string | null
          data_freshness: string | null
          displayed_class: number | null
          fallback_reason: string | null
          fallback_used: boolean
          feature_version: string | null
          forecast_at: string
          forecast_horizon_days: number | null
          forecast_run_id: string | null
          horizon_reliability: string | null
          id: number
          is_experimental: boolean
          model_name: string
          pm25_max_forecast: number | null
          pm25_mean_forecast: number
          pm25_p10_forecast: number | null
          pm25_p50_forecast: number | null
          pm25_p90_forecast: number | null
          province_id: string
          regression_derived_class: number | null
          regression_model_name: string | null
          regression_run_id: string | null
          target_date: string
          uncertainty_method: string | null
        }
        Insert: {
          class_agreement?: boolean | null
          class_label_en?: string | null
          class_label_th?: string | null
          class_probabilities?: Json | null
          classification_source?: string | null
          classifier_model_name?: string | null
          classifier_predicted_class?: number | null
          classifier_run_id?: string | null
          confidence?: number | null
          created_at?: string | null
          data_freshness?: string | null
          displayed_class?: number | null
          fallback_reason?: string | null
          fallback_used?: boolean
          feature_version?: string | null
          forecast_at: string
          forecast_horizon_days?: number | null
          forecast_run_id?: string | null
          horizon_reliability?: string | null
          id?: number
          is_experimental?: boolean
          model_name: string
          pm25_max_forecast?: number | null
          pm25_mean_forecast: number
          pm25_p10_forecast?: number | null
          pm25_p50_forecast?: number | null
          pm25_p90_forecast?: number | null
          province_id: string
          regression_derived_class?: number | null
          regression_model_name?: string | null
          regression_run_id?: string | null
          target_date: string
          uncertainty_method?: string | null
        }
        Update: {
          class_agreement?: boolean | null
          class_label_en?: string | null
          class_label_th?: string | null
          class_probabilities?: Json | null
          classification_source?: string | null
          classifier_model_name?: string | null
          classifier_predicted_class?: number | null
          classifier_run_id?: string | null
          confidence?: number | null
          created_at?: string | null
          data_freshness?: string | null
          displayed_class?: number | null
          fallback_reason?: string | null
          fallback_used?: boolean
          feature_version?: string | null
          forecast_at?: string
          forecast_horizon_days?: number | null
          forecast_run_id?: string | null
          horizon_reliability?: string | null
          id?: number
          is_experimental?: boolean
          model_name?: string
          pm25_max_forecast?: number | null
          pm25_mean_forecast?: number
          pm25_p10_forecast?: number | null
          pm25_p50_forecast?: number | null
          pm25_p90_forecast?: number | null
          province_id?: string
          regression_derived_class?: number | null
          regression_model_name?: string | null
          regression_run_id?: string | null
          target_date?: string
          uncertainty_method?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "forecast_daily_forecast_run_id_fkey"
            columns: ["forecast_run_id"]
            isOneToOne: false
            referencedRelation: "forecast_runs"
            referencedColumns: ["run_id"]
          },
          {
            foreignKeyName: "forecast_daily_province_id_fkey"
            columns: ["province_id"]
            isOneToOne: false
            referencedRelation: "isan_provinces"
            referencedColumns: ["province_id"]
          },
        ]
      }
      forecast_evaluations: {
        Row: {
          absolute_error: number | null
          actual_class: number | null
          actual_observed_at: string | null
          actual_pm25: number
          actual_source: string
          class_correct: boolean | null
          evaluated_at: string
          forecast_daily_id: number
          id: number
          interval_covered: boolean | null
          squared_error: number | null
        }
        Insert: {
          absolute_error?: number | null
          actual_class?: number | null
          actual_observed_at?: string | null
          actual_pm25: number
          actual_source: string
          class_correct?: boolean | null
          evaluated_at?: string
          forecast_daily_id: number
          id?: number
          interval_covered?: boolean | null
          squared_error?: number | null
        }
        Update: {
          absolute_error?: number | null
          actual_class?: number | null
          actual_observed_at?: string | null
          actual_pm25?: number
          actual_source?: string
          class_correct?: boolean | null
          evaluated_at?: string
          forecast_daily_id?: number
          id?: number
          interval_covered?: boolean | null
          squared_error?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "forecast_evaluations_forecast_daily_id_fkey"
            columns: ["forecast_daily_id"]
            isOneToOne: false
            referencedRelation: "forecast_daily"
            referencedColumns: ["id"]
          },
        ]
      }
      forecast_hourly: {
        Row: {
          created_at: string | null
          forecast_at: string
          id: number
          model_name: string
          pm25_forecast: number
          province_id: string
          target_time: string
        }
        Insert: {
          created_at?: string | null
          forecast_at: string
          id?: number
          model_name: string
          pm25_forecast: number
          province_id: string
          target_time: string
        }
        Update: {
          created_at?: string | null
          forecast_at?: string
          id?: number
          model_name?: string
          pm25_forecast?: number
          province_id?: string
          target_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "forecast_hourly_province_id_fkey"
            columns: ["province_id"]
            isOneToOne: false
            referencedRelation: "isan_provinces"
            referencedColumns: ["province_id"]
          },
        ]
      }
      forecast_runs: {
        Row: {
          code_version: string | null
          completed_at: string | null
          configuration: Json
          error_message: string | null
          feature_version: string | null
          forecast_at: string
          horizon_days: number
          run_id: string
          serving_policy: string | null
          source_as_of: string | null
          started_at: string
          status: string
        }
        Insert: {
          code_version?: string | null
          completed_at?: string | null
          configuration?: Json
          error_message?: string | null
          feature_version?: string | null
          forecast_at: string
          horizon_days: number
          run_id?: string
          serving_policy?: string | null
          source_as_of?: string | null
          started_at?: string
          status?: string
        }
        Update: {
          code_version?: string | null
          completed_at?: string | null
          configuration?: Json
          error_message?: string | null
          feature_version?: string | null
          forecast_at?: string
          horizon_days?: number
          run_id?: string
          serving_policy?: string | null
          source_as_of?: string | null
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      hotspot_daily: {
        Row: {
          created_at: string | null
          date: string
          high_confidence_count: number | null
          hotspot_count: number
          id: number
          max_frp: number | null
          province_id: string
          source: string
          total_frp: number | null
        }
        Insert: {
          created_at?: string | null
          date: string
          high_confidence_count?: number | null
          hotspot_count?: number
          id?: number
          max_frp?: number | null
          province_id: string
          source?: string
          total_frp?: number | null
        }
        Update: {
          created_at?: string | null
          date?: string
          high_confidence_count?: number | null
          hotspot_count?: number
          id?: number
          max_frp?: number | null
          province_id?: string
          source?: string
          total_frp?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hotspot_daily_province_id_fkey"
            columns: ["province_id"]
            isOneToOne: false
            referencedRelation: "isan_provinces"
            referencedColumns: ["province_id"]
          },
        ]
      }
      isan_provinces: {
        Row: {
          area_km2: number | null
          created_at: string | null
          lat: number
          lon: number
          name_en: string
          name_th: string
          province_id: string
        }
        Insert: {
          area_km2?: number | null
          created_at?: string | null
          lat: number
          lon: number
          name_en: string
          name_th: string
          province_id: string
        }
        Update: {
          area_km2?: number | null
          created_at?: string | null
          lat?: number
          lon?: number
          name_en?: string
          name_th?: string
          province_id?: string
        }
        Relationships: []
      }
      model_artifacts: {
        Row: {
          artifact_id: string
          artifact_kind: string
          byte_size: number | null
          content_type: string | null
          created_at: string
          dependency_lock: Json
          immutable: boolean
          model_registry_id: number
          sha256: string
          storage_uri: string
        }
        Insert: {
          artifact_id?: string
          artifact_kind: string
          byte_size?: number | null
          content_type?: string | null
          created_at?: string
          dependency_lock?: Json
          immutable?: boolean
          model_registry_id: number
          sha256: string
          storage_uri: string
        }
        Update: {
          artifact_id?: string
          artifact_kind?: string
          byte_size?: number | null
          content_type?: string | null
          created_at?: string
          dependency_lock?: Json
          immutable?: boolean
          model_registry_id?: number
          sha256?: string
          storage_uri?: string
        }
        Relationships: [
          {
            foreignKeyName: "model_artifacts_model_registry_id_fkey"
            columns: ["model_registry_id"]
            isOneToOne: false
            referencedRelation: "model_registry"
            referencedColumns: ["id"]
          },
        ]
      }
      model_drift_metrics: {
        Row: {
          bias: number | null
          brier_score: number | null
          created_at: string
          expected_calibration_error: number | null
          feature_drift: Json
          horizon_days: number
          id: number
          interval_coverage: number | null
          macro_f1: number | null
          mae: number | null
          model_registry_id: number
          province_id: string
          residual_drift: Json
          rmse: number | null
          sample_count: number
          window_end: string
          window_start: string
        }
        Insert: {
          bias?: number | null
          brier_score?: number | null
          created_at?: string
          expected_calibration_error?: number | null
          feature_drift?: Json
          horizon_days: number
          id?: number
          interval_coverage?: number | null
          macro_f1?: number | null
          mae?: number | null
          model_registry_id: number
          province_id: string
          residual_drift?: Json
          rmse?: number | null
          sample_count: number
          window_end: string
          window_start: string
        }
        Update: {
          bias?: number | null
          brier_score?: number | null
          created_at?: string
          expected_calibration_error?: number | null
          feature_drift?: Json
          horizon_days?: number
          id?: number
          interval_coverage?: number | null
          macro_f1?: number | null
          mae?: number | null
          model_registry_id?: number
          province_id?: string
          residual_drift?: Json
          rmse?: number | null
          sample_count?: number
          window_end?: string
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "model_drift_metrics_model_registry_id_fkey"
            columns: ["model_registry_id"]
            isOneToOne: false
            referencedRelation: "model_registry"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "model_drift_metrics_province_id_fkey"
            columns: ["province_id"]
            isOneToOne: false
            referencedRelation: "isan_provinces"
            referencedColumns: ["province_id"]
          },
        ]
      }
      model_registry: {
        Row: {
          activated_at: string | null
          artifact_ref: string | null
          artifact_sha256: string | null
          artifact_uri: string | null
          baseline_metrics: Json
          class_distribution: Json
          code_version: string | null
          created_at: string | null
          data_cutoff: string | null
          eligibility_reason: string | null
          eligibility_status: boolean
          evidence_status: string
          feature_schema: Json | null
          feature_version: string | null
          id: number
          is_active: boolean | null
          mae: number | null
          metrics: Json
          model_family: string | null
          model_name: string
          model_params: Json | null
          model_version: string | null
          province_id: string | null
          r2: number | null
          rmse: number | null
          run_id: string
          runtime_artifact_byte_size: number | null
          runtime_artifact_format: string | null
          runtime_artifact_sha256: string | null
          runtime_artifact_uri: string | null
          serving_model_family: string | null
          source: string | null
          task_type: string
          teacher_model_family: string | null
          test_end: string | null
          test_rows: number | null
          test_start: string | null
          threshold_version: string | null
          train_end: string | null
          train_start: string | null
          trained_at: string
          training_rows: number | null
          validation_end: string | null
          validation_rows: number | null
          validation_start: string | null
        }
        Insert: {
          activated_at?: string | null
          artifact_ref?: string | null
          artifact_sha256?: string | null
          artifact_uri?: string | null
          baseline_metrics?: Json
          class_distribution?: Json
          code_version?: string | null
          created_at?: string | null
          data_cutoff?: string | null
          eligibility_reason?: string | null
          eligibility_status?: boolean
          evidence_status?: string
          feature_schema?: Json | null
          feature_version?: string | null
          id?: number
          is_active?: boolean | null
          mae?: number | null
          metrics?: Json
          model_family?: string | null
          model_name: string
          model_params?: Json | null
          model_version?: string | null
          province_id?: string | null
          r2?: number | null
          rmse?: number | null
          run_id?: string
          runtime_artifact_byte_size?: number | null
          runtime_artifact_format?: string | null
          runtime_artifact_sha256?: string | null
          runtime_artifact_uri?: string | null
          serving_model_family?: string | null
          source?: string | null
          task_type?: string
          teacher_model_family?: string | null
          test_end?: string | null
          test_rows?: number | null
          test_start?: string | null
          threshold_version?: string | null
          train_end?: string | null
          train_start?: string | null
          trained_at?: string
          training_rows?: number | null
          validation_end?: string | null
          validation_rows?: number | null
          validation_start?: string | null
        }
        Update: {
          activated_at?: string | null
          artifact_ref?: string | null
          artifact_sha256?: string | null
          artifact_uri?: string | null
          baseline_metrics?: Json
          class_distribution?: Json
          code_version?: string | null
          created_at?: string | null
          data_cutoff?: string | null
          eligibility_reason?: string | null
          eligibility_status?: boolean
          evidence_status?: string
          feature_schema?: Json | null
          feature_version?: string | null
          id?: number
          is_active?: boolean | null
          mae?: number | null
          metrics?: Json
          model_family?: string | null
          model_name?: string
          model_params?: Json | null
          model_version?: string | null
          province_id?: string | null
          r2?: number | null
          rmse?: number | null
          run_id?: string
          runtime_artifact_byte_size?: number | null
          runtime_artifact_format?: string | null
          runtime_artifact_sha256?: string | null
          runtime_artifact_uri?: string | null
          serving_model_family?: string | null
          source?: string | null
          task_type?: string
          teacher_model_family?: string | null
          test_end?: string | null
          test_rows?: number | null
          test_start?: string | null
          threshold_version?: string | null
          train_end?: string | null
          train_start?: string | null
          trained_at?: string
          training_rows?: number | null
          validation_end?: string | null
          validation_rows?: number | null
          validation_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "model_registry_province_id_fkey"
            columns: ["province_id"]
            isOneToOne: false
            referencedRelation: "isan_provinces"
            referencedColumns: ["province_id"]
          },
        ]
      }
      pipeline_alerts: {
        Row: {
          alert_id: number
          details: Json
          fingerprint: string
          first_seen_at: string
          job_name: string
          last_seen_at: string
          message: string
          resolved_at: string | null
          severity: string
        }
        Insert: {
          alert_id?: number
          details?: Json
          fingerprint: string
          first_seen_at?: string
          job_name: string
          last_seen_at?: string
          message: string
          resolved_at?: string | null
          severity: string
        }
        Update: {
          alert_id?: number
          details?: Json
          fingerprint?: string
          first_seen_at?: string
          job_name?: string
          last_seen_at?: string
          message?: string
          resolved_at?: string | null
          severity?: string
        }
        Relationships: []
      }
      province_neighbours: {
        Row: {
          neighbour_id: string
          province_id: string
        }
        Insert: {
          neighbour_id: string
          province_id: string
        }
        Update: {
          neighbour_id?: string
          province_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "province_neighbours_neighbour_id_fkey"
            columns: ["neighbour_id"]
            isOneToOne: false
            referencedRelation: "isan_provinces"
            referencedColumns: ["province_id"]
          },
          {
            foreignKeyName: "province_neighbours_province_id_fkey"
            columns: ["province_id"]
            isOneToOne: false
            referencedRelation: "isan_provinces"
            referencedColumns: ["province_id"]
          },
        ]
      }
      region_membership: {
        Row: {
          is_primary: boolean
          province_id: string
          region_code: string
          region_level: string
          region_name_en: string | null
          region_name_th: string | null
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          is_primary?: boolean
          province_id: string
          region_code: string
          region_level: string
          region_name_en?: string | null
          region_name_th?: string | null
          valid_from?: string
          valid_to?: string | null
        }
        Update: {
          is_primary?: boolean
          province_id?: string
          region_code?: string
          region_level?: string
          region_name_en?: string | null
          region_name_th?: string | null
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "region_membership_province_id_fkey"
            columns: ["province_id"]
            isOneToOne: false
            referencedRelation: "isan_provinces"
            referencedColumns: ["province_id"]
          },
        ]
      }
      station_observations: {
        Row: {
          aqi: number | null
          created_at: string
          id: number
          is_production_eligible: boolean
          observed_at: string
          pm10: number | null
          pm25: number | null
          quality_flag: string
          raw_payload: Json
          source: string
          source_record_id: string | null
          station_id: string
        }
        Insert: {
          aqi?: number | null
          created_at?: string
          id?: number
          is_production_eligible?: boolean
          observed_at: string
          pm10?: number | null
          pm25?: number | null
          quality_flag?: string
          raw_payload?: Json
          source: string
          source_record_id?: string | null
          station_id: string
        }
        Update: {
          aqi?: number | null
          created_at?: string
          id?: number
          is_production_eligible?: boolean
          observed_at?: string
          pm10?: number | null
          pm25?: number | null
          quality_flag?: string
          raw_payload?: Json
          source?: string
          source_record_id?: string | null
          station_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "station_observations_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["station_id"]
          },
        ]
      }
      stations: {
        Row: {
          created_at: string
          elevation_m: number | null
          is_active: boolean
          latitude: number
          longitude: number
          metadata: Json
          name_en: string | null
          name_th: string | null
          province_id: string
          source: string
          station_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          elevation_m?: number | null
          is_active?: boolean
          latitude: number
          longitude: number
          metadata?: Json
          name_en?: string | null
          name_th?: string | null
          province_id: string
          source: string
          station_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          elevation_m?: number | null
          is_active?: boolean
          latitude?: number
          longitude?: number
          metadata?: Json
          name_en?: string | null
          name_th?: string | null
          province_id?: string
          source?: string
          station_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stations_province_id_fkey"
            columns: ["province_id"]
            isOneToOne: false
            referencedRelation: "isan_provinces"
            referencedColumns: ["province_id"]
          },
        ]
      }
      sync_state: {
        Row: {
          cursor_at: string | null
          duration_ms: number | null
          error_msg: string | null
          id: number
          job_name: string
          last_run_at: string | null
          last_success_at: string | null
          next_run_at: string | null
          records_processed: number
          schedule: string | null
          source: string | null
          status: string
          updated_at: string
        }
        Insert: {
          cursor_at?: string | null
          duration_ms?: number | null
          error_msg?: string | null
          id?: never
          job_name: string
          last_run_at?: string | null
          last_success_at?: string | null
          next_run_at?: string | null
          records_processed?: number
          schedule?: string | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          cursor_at?: string | null
          duration_ms?: number | null
          error_msg?: string | null
          id?: never
          job_name?: string
          last_run_at?: string | null
          last_success_at?: string | null
          next_run_at?: string | null
          records_processed?: number
          schedule?: string | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      synthetic_data_retirement_plan: {
        Row: {
          approved_at: string | null
          candidate_filter: string
          created_at: string
          executed_at: string | null
          id: number
          proposed_action: string
          table_name: string
        }
        Insert: {
          approved_at?: string | null
          candidate_filter: string
          created_at?: string
          executed_at?: string | null
          id?: never
          proposed_action: string
          table_name: string
        }
        Update: {
          approved_at?: string | null
          candidate_filter?: string
          created_at?: string
          executed_at?: string | null
          id?: never
          proposed_action?: string
          table_name?: string
        }
        Relationships: []
      }
      training_arima: {
        Row: {
          created_at: string | null
          date: string
          id: number
          pm25_mean: number | null
          province_id: string
          split: string | null
          target_d1: number | null
          target_d2: number | null
          target_d3: number | null
          target_d4: number | null
          target_d5: number | null
          target_d6: number | null
          target_d7: number | null
        }
        Insert: {
          created_at?: string | null
          date: string
          id?: number
          pm25_mean?: number | null
          province_id: string
          split?: string | null
          target_d1?: number | null
          target_d2?: number | null
          target_d3?: number | null
          target_d4?: number | null
          target_d5?: number | null
          target_d6?: number | null
          target_d7?: number | null
        }
        Update: {
          created_at?: string | null
          date?: string
          id?: number
          pm25_mean?: number | null
          province_id?: string
          split?: string | null
          target_d1?: number | null
          target_d2?: number | null
          target_d3?: number | null
          target_d4?: number | null
          target_d5?: number | null
          target_d6?: number | null
          target_d7?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "training_arima_province_id_fkey"
            columns: ["province_id"]
            isOneToOne: false
            referencedRelation: "isan_provinces"
            referencedColumns: ["province_id"]
          },
        ]
      }
      training_lstm: {
        Row: {
          created_at: string | null
          humidity_seq: number[] | null
          id: number
          pm25_sequence: number[] | null
          province_id: string
          split: string | null
          target_d1: number | null
          target_d2: number | null
          target_d3: number | null
          target_d4: number | null
          target_d5: number | null
          target_d6: number | null
          target_d7: number | null
          temp_sequence: number[] | null
          wind_seq: number[] | null
          window_end: string
          window_start: string
        }
        Insert: {
          created_at?: string | null
          humidity_seq?: number[] | null
          id?: number
          pm25_sequence?: number[] | null
          province_id: string
          split?: string | null
          target_d1?: number | null
          target_d2?: number | null
          target_d3?: number | null
          target_d4?: number | null
          target_d5?: number | null
          target_d6?: number | null
          target_d7?: number | null
          temp_sequence?: number[] | null
          wind_seq?: number[] | null
          window_end: string
          window_start: string
        }
        Update: {
          created_at?: string | null
          humidity_seq?: number[] | null
          id?: number
          pm25_sequence?: number[] | null
          province_id?: string
          split?: string | null
          target_d1?: number | null
          target_d2?: number | null
          target_d3?: number | null
          target_d4?: number | null
          target_d5?: number | null
          target_d6?: number | null
          target_d7?: number | null
          temp_sequence?: number[] | null
          wind_seq?: number[] | null
          window_end?: string
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_lstm_province_id_fkey"
            columns: ["province_id"]
            isOneToOne: false
            referencedRelation: "isan_provinces"
            referencedColumns: ["province_id"]
          },
        ]
      }
      training_tabular: {
        Row: {
          cloud_cover_mean: number | null
          created_at: string | null
          date: string
          day_of_week: number | null
          hotspot_count: number | null
          hotspot_roll7: number | null
          humidity_mean: number | null
          id: number
          is_burning_season: boolean | null
          is_dry_season: boolean | null
          is_weekend: boolean | null
          month: number | null
          neighbor_pm25_avg: number | null
          neighbor_pm25_max: number | null
          neighbor_pm25_min: number | null
          pm25_lag_1d: number | null
          pm25_lag_3d: number | null
          pm25_lag_7d: number | null
          pm25_roll14: number | null
          pm25_roll3: number | null
          pm25_roll7: number | null
          pm25_std7: number | null
          precip_roll7: number | null
          precip_total: number | null
          province_id: string
          province_lat: number | null
          province_lon: number | null
          regional_humidity_avg: number | null
          regional_pm25_avg: number | null
          regional_wind_speed_avg: number | null
          split: string | null
          target_d1: number | null
          target_d2: number | null
          target_d3: number | null
          target_d4: number | null
          target_d5: number | null
          target_d6: number | null
          target_d7: number | null
          temp_mean: number | null
          wind_dir_mean: number | null
          wind_speed_mean: number | null
        }
        Insert: {
          cloud_cover_mean?: number | null
          created_at?: string | null
          date: string
          day_of_week?: number | null
          hotspot_count?: number | null
          hotspot_roll7?: number | null
          humidity_mean?: number | null
          id?: number
          is_burning_season?: boolean | null
          is_dry_season?: boolean | null
          is_weekend?: boolean | null
          month?: number | null
          neighbor_pm25_avg?: number | null
          neighbor_pm25_max?: number | null
          neighbor_pm25_min?: number | null
          pm25_lag_1d?: number | null
          pm25_lag_3d?: number | null
          pm25_lag_7d?: number | null
          pm25_roll14?: number | null
          pm25_roll3?: number | null
          pm25_roll7?: number | null
          pm25_std7?: number | null
          precip_roll7?: number | null
          precip_total?: number | null
          province_id: string
          province_lat?: number | null
          province_lon?: number | null
          regional_humidity_avg?: number | null
          regional_pm25_avg?: number | null
          regional_wind_speed_avg?: number | null
          split?: string | null
          target_d1?: number | null
          target_d2?: number | null
          target_d3?: number | null
          target_d4?: number | null
          target_d5?: number | null
          target_d6?: number | null
          target_d7?: number | null
          temp_mean?: number | null
          wind_dir_mean?: number | null
          wind_speed_mean?: number | null
        }
        Update: {
          cloud_cover_mean?: number | null
          created_at?: string | null
          date?: string
          day_of_week?: number | null
          hotspot_count?: number | null
          hotspot_roll7?: number | null
          humidity_mean?: number | null
          id?: number
          is_burning_season?: boolean | null
          is_dry_season?: boolean | null
          is_weekend?: boolean | null
          month?: number | null
          neighbor_pm25_avg?: number | null
          neighbor_pm25_max?: number | null
          neighbor_pm25_min?: number | null
          pm25_lag_1d?: number | null
          pm25_lag_3d?: number | null
          pm25_lag_7d?: number | null
          pm25_roll14?: number | null
          pm25_roll3?: number | null
          pm25_roll7?: number | null
          pm25_std7?: number | null
          precip_roll7?: number | null
          precip_total?: number | null
          province_id?: string
          province_lat?: number | null
          province_lon?: number | null
          regional_humidity_avg?: number | null
          regional_pm25_avg?: number | null
          regional_wind_speed_avg?: number | null
          split?: string | null
          target_d1?: number | null
          target_d2?: number | null
          target_d3?: number | null
          target_d4?: number | null
          target_d5?: number | null
          target_d6?: number | null
          target_d7?: number | null
          temp_mean?: number | null
          wind_dir_mean?: number | null
          wind_speed_mean?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "training_tabular_province_id_fkey"
            columns: ["province_id"]
            isOneToOne: false
            referencedRelation: "isan_provinces"
            referencedColumns: ["province_id"]
          },
        ]
      }
      weather_hourly: {
        Row: {
          cloud_cover: number | null
          created_at: string | null
          humidity: number | null
          id: number
          observed_at: string
          precipitation: number | null
          pressure: number | null
          province_id: string
          source: string
          temperature: number | null
          visibility: number | null
          wind_direction: number | null
          wind_speed: number | null
        }
        Insert: {
          cloud_cover?: number | null
          created_at?: string | null
          humidity?: number | null
          id?: number
          observed_at: string
          precipitation?: number | null
          pressure?: number | null
          province_id: string
          source?: string
          temperature?: number | null
          visibility?: number | null
          wind_direction?: number | null
          wind_speed?: number | null
        }
        Update: {
          cloud_cover?: number | null
          created_at?: string | null
          humidity?: number | null
          id?: number
          observed_at?: string
          precipitation?: number | null
          pressure?: number | null
          province_id?: string
          source?: string
          temperature?: number | null
          visibility?: number | null
          wind_direction?: number | null
          wind_speed?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "weather_hourly_province_id_fkey"
            columns: ["province_id"]
            isOneToOne: false
            referencedRelation: "isan_provinces"
            referencedColumns: ["province_id"]
          },
        ]
      }
    }
    Views: {
      air_quality_latest: {
        Row: {
          aqi: number | null
          aqi_category: string | null
          created_at: string | null
          id: number | null
          observed_at: string | null
          pm10: number | null
          pm25: number | null
          province_id: string | null
          source: string | null
          station_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "air_quality_hourly_province_id_fkey"
            columns: ["province_id"]
            isOneToOne: false
            referencedRelation: "isan_provinces"
            referencedColumns: ["province_id"]
          },
        ]
      }
      trusted_daily_metrics_v1: {
        Row: {
          aqi_mean: number | null
          date: string
          day_of_week: number | null
          hotspot_count: number | null
          hours_available: number | null
          humidity_mean: number | null
          is_burning_season: boolean | null
          is_dry_season: boolean | null
          month: number | null
          pm10_mean: number | null
          pm25_max: number | null
          pm25_mean: number | null
          pm25_min: number | null
          province_id: string
          temp_max: number | null
          temp_mean: number | null
          temp_min: number | null
          trusted_observed_at: string | null
          trusted_sources: string[] | null
          wind_dir_mean: number | null
          wind_speed_max: number | null
          wind_speed_mean: number | null
        }
        Relationships: [
          {
            foreignKeyName: "air_quality_hourly_province_id_fkey"
            columns: ["province_id"]
            isOneToOne: false
            referencedRelation: "isan_provinces"
            referencedColumns: ["province_id"]
          },
        ]
      }
      observed_hotspot_daily_v1: {
        Row: {
          created_at: string | null
          date: string
          high_confidence_count: number | null
          hotspot_count: number
          id: number
          max_frp: number | null
          province_id: string
          source: string
          total_frp: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hotspot_daily_province_id_fkey"
            columns: ["province_id"]
            isOneToOne: false
            referencedRelation: "isan_provinces"
            referencedColumns: ["province_id"]
          },
        ]
      }
      training_daily_summary_v2: {
        Row: {
          aqi_max: number | null
          aqi_mean: number | null
          cloud_cover_mean: number | null
          created_at: string | null
          date: string | null
          day_of_week: number | null
          feature_provenance: Json | null
          hotspot_count: number | null
          hotspot_lineage_is_trusted: boolean | null
          hotspot_roll3: number | null
          hotspot_roll7: number | null
          hours_available: number | null
          humidity_mean: number | null
          id: number | null
          is_burning_season: boolean | null
          is_dry_season: boolean | null
          is_weekend: boolean | null
          month: number | null
          neighbor_pm25_avg: number | null
          neighbor_pm25_max: number | null
          neighbor_pm25_min: number | null
          observed_hotspot_count: number | null
          observed_hotspot_sources: string[] | null
          observed_total_frp: number | null
          pm10_mean: number | null
          pm25_lag_1d: number | null
          pm25_lag_3d: number | null
          pm25_lag_7d: number | null
          pm25_max: number | null
          pm25_mean: number | null
          pm25_min: number | null
          pm25_p75: number | null
          pm25_p90: number | null
          pm25_roll14: number | null
          pm25_roll3: number | null
          pm25_roll7: number | null
          pm25_std7: number | null
          precip_roll3: number | null
          precip_roll7: number | null
          precip_total: number | null
          pressure_mean: number | null
          province_id: string | null
          regional_humidity_avg: number | null
          regional_pm25_avg: number | null
          regional_wind_speed_avg: number | null
          temp_max: number | null
          temp_mean: number | null
          temp_min: number | null
          total_frp: number | null
          trusted_hours: number | null
          trusted_observed_at: string | null
          trusted_sources: string[] | null
          updated_at: string | null
          wind_dir_mean: number | null
          wind_speed_max: number | null
          wind_speed_mean: number | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_summary_province_id_fkey"
            columns: ["province_id"]
            isOneToOne: false
            referencedRelation: "isan_provinces"
            referencedColumns: ["province_id"]
          },
        ]
      }
      weather_latest: {
        Row: {
          cloud_cover: number | null
          created_at: string | null
          humidity: number | null
          id: number | null
          observed_at: string | null
          precipitation: number | null
          pressure: number | null
          province_id: string | null
          source: string | null
          temperature: number | null
          visibility: number | null
          wind_direction: number | null
          wind_speed: number | null
        }
        Relationships: [
          {
            foreignKeyName: "weather_hourly_province_id_fkey"
            columns: ["province_id"]
            isOneToOne: false
            referencedRelation: "isan_provinces"
            referencedColumns: ["province_id"]
          },
        ]
      }
    }
    Functions: {
      aqi_category: { Args: { aqi: number }; Returns: string }
      fn_activate_model: {
        Args: { p_model_name: string; p_province_id: string; p_run_id?: string }
        Returns: Json
      }
      fn_activate_model_task: {
        Args: {
          p_allow_ineligible?: boolean
          p_model_name: string
          p_province_id: string
          p_run_id?: string
          p_task_type: string
        }
        Returns: Json
      }
      fn_backtest_ensemble: {
        Args: { p_pid: string; p_window?: number }
        Returns: {
          mae: number
          n: number
          r2: number
          rmse: number
          skill: number
        }[]
      }
      fn_build_daily_summary: { Args: { p_date: string }; Returns: number }
      fn_cleanup_old_data: { Args: never; Returns: Json }
      fn_daily_pipeline: { Args: never; Returns: Json }
      fn_ensemble_predict_1step: {
        Args: { p_asof: string; p_pid: string }
        Returns: number
      }
      fn_evaluate_due_forecasts: { Args: never; Returns: Json }
      fn_generate_forecast: { Args: { p_horizon?: number }; Returns: number }
      fn_record_pipeline_alert: {
        Args: {
          p_details?: Json
          p_fingerprint: string
          p_job_name: string
          p_message: string
          p_severity?: string
        }
        Returns: Json
      }
      fn_refresh_next_runs: { Args: never; Returns: undefined }
      fn_resolve_pipeline_alert: {
        Args: { p_fingerprint: string; p_job_name: string }
        Returns: Json
      }
      fn_sync_air_weather: { Args: { p_past_days?: number }; Returns: Json }
      fn_sync_hotspots: { Args: { p_days?: number }; Returns: Json }
      fn_trigger_edge_sync: { Args: never; Returns: number }
      fn_upsert_forecast_daily: { Args: { rows: Json }; Returns: Json }
      fn_upsert_model_registry: { Args: { rows: Json }; Returns: Json }
      pm25_to_aqi: { Args: { pm25: number }; Returns: number }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      synth_pm25_isan: {
        Args: { baseline: number; hour: number; month: number }
        Returns: number
      }
      update_sync_state: {
        Args: { p_last_sync: string; p_records_last?: number; p_source: string }
        Returns: undefined
      }
      upsert_air_quality: { Args: { p_rows: Json }; Returns: number }
      upsert_hotspot: { Args: { p_rows: Json }; Returns: number }
      upsert_weather: { Args: { p_rows: Json }; Returns: number }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
