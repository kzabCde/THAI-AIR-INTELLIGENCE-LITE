// Auto-generated from the live Supabase project (Isan Air Quality).
// Regenerate with: supabase gen types typescript --project-id <ref>

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      air_quality_hourly: {
        Row: {
          aqi: number | null;
          aqi_category: string | null;
          created_at: string | null;
          id: number;
          observed_at: string;
          pm10: number | null;
          pm25: number | null;
          province_id: string;
          source: string;
          station_id: string | null;
        };
        Insert: {
          aqi?: number | null;
          aqi_category?: string | null;
          created_at?: string | null;
          id?: number;
          observed_at: string;
          pm10?: number | null;
          pm25?: number | null;
          province_id: string;
          source?: string;
          station_id?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["air_quality_hourly"]["Insert"]>;
        Relationships: [];
      };
      cron_log: {
        Row: {
          id: number;
          job_name: string;
          started_at: string | null;
          finished_at: string | null;
          status: string;
          duration_ms: number | null;
          records_in: number | null;
          records_out: number | null;
          error_msg: string | null;
          meta: Json | null;
        };
        Insert: {
          id?: never;
          job_name: string;
          started_at?: string | null;
          finished_at?: string | null;
          status?: string;
          duration_ms?: number | null;
          records_in?: number | null;
          records_out?: number | null;
          error_msg?: string | null;
          meta?: Json | null;
        };
        Update: Partial<Database["public"]["Tables"]["cron_log"]["Insert"]>;
        Relationships: [];
      };
      daily_summary: {
        Row: {
          aqi_max: number | null;
          aqi_mean: number | null;
          cloud_cover_mean: number | null;
          created_at: string | null;
          date: string;
          day_of_week: number | null;
          hotspot_count: number | null;
          hours_available: number | null;
          humidity_mean: number | null;
          id: number;
          is_burning_season: boolean | null;
          is_dry_season: boolean | null;
          is_weekend: boolean | null;
          month: number | null;
          neighbor_pm25_avg: number | null;
          pm10_mean: number | null;
          pm25_max: number | null;
          pm25_mean: number | null;
          pm25_min: number | null;
          pm25_p75: number | null;
          pm25_p90: number | null;
          pm25_roll7: number | null;
          precip_total: number | null;
          pressure_mean: number | null;
          province_id: string;
          regional_pm25_avg: number | null;
          temp_max: number | null;
          temp_mean: number | null;
          temp_min: number | null;
          total_frp: number | null;
          updated_at: string | null;
          wind_dir_mean: number | null;
          wind_speed_max: number | null;
          wind_speed_mean: number | null;
        };
        Insert: {
          date: string;
          province_id: string;
          [key: string]: Json | undefined;
        };
        Update: Partial<Database["public"]["Tables"]["daily_summary"]["Insert"]>;
        Relationships: [];
      };
      forecast_daily: {
        Row: {
          created_at: string | null;
          forecast_at: string;
          id: number;
          model_name: string;
          pm25_max_forecast: number | null;
          pm25_mean_forecast: number;
          province_id: string;
          target_date: string;
        };
        Insert: {
          created_at?: string | null;
          forecast_at: string;
          id?: number;
          model_name: string;
          pm25_max_forecast?: number | null;
          pm25_mean_forecast: number;
          province_id: string;
          target_date: string;
        };
        Update: Partial<Database["public"]["Tables"]["forecast_daily"]["Insert"]>;
        Relationships: [];
      };
      forecast_hourly: {
        Row: {
          created_at: string | null;
          forecast_at: string;
          id: number;
          model_name: string;
          pm25_forecast: number;
          province_id: string;
          target_time: string;
        };
        Insert: {
          created_at?: string | null;
          forecast_at: string;
          id?: number;
          model_name: string;
          pm25_forecast: number;
          province_id: string;
          target_time: string;
        };
        Update: Partial<Database["public"]["Tables"]["forecast_hourly"]["Insert"]>;
        Relationships: [];
      };
      hotspot_daily: {
        Row: {
          created_at: string | null;
          date: string;
          high_confidence_count: number | null;
          hotspot_count: number;
          id: number;
          max_frp: number | null;
          province_id: string;
          source: string;
          total_frp: number | null;
        };
        Insert: {
          created_at?: string | null;
          date: string;
          high_confidence_count?: number | null;
          hotspot_count?: number;
          id?: number;
          max_frp?: number | null;
          province_id: string;
          source?: string;
          total_frp?: number | null;
        };
        Update: Partial<Database["public"]["Tables"]["hotspot_daily"]["Insert"]>;
        Relationships: [];
      };
      isan_provinces: {
        Row: {
          area_km2: number | null;
          created_at: string | null;
          lat: number;
          lon: number;
          name_en: string;
          name_th: string;
          province_id: string;
        };
        Insert: {
          area_km2?: number | null;
          created_at?: string | null;
          lat: number;
          lon: number;
          name_en: string;
          name_th: string;
          province_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["isan_provinces"]["Insert"]>;
        Relationships: [];
      };
      weather_hourly: {
        Row: {
          cloud_cover: number | null;
          created_at: string | null;
          humidity: number | null;
          id: number;
          observed_at: string;
          precipitation: number | null;
          pressure: number | null;
          province_id: string;
          source: string;
          temperature: number | null;
          visibility: number | null;
          wind_direction: number | null;
          wind_speed: number | null;
        };
        Insert: {
          cloud_cover?: number | null;
          created_at?: string | null;
          humidity?: number | null;
          id?: number;
          observed_at: string;
          precipitation?: number | null;
          pressure?: number | null;
          province_id: string;
          source?: string;
          temperature?: number | null;
          visibility?: number | null;
          wind_direction?: number | null;
          wind_speed?: number | null;
        };
        Update: Partial<Database["public"]["Tables"]["weather_hourly"]["Insert"]>;
        Relationships: [];
      };
      model_registry: {
        Row: {
          id: number;
          model_name: string;
          province_id: string;
          trained_at: string;
          training_rows: number | null;
          mae: number | null;
          rmse: number | null;
          r2: number | null;
          is_active: boolean;
          model_params: Json | null;
          created_at: string | null;
        };
        Insert: {
          id?: number;
          model_name: string;
          province_id: string;
          trained_at?: string;
          training_rows?: number | null;
          mae?: number | null;
          rmse?: number | null;
          r2?: number | null;
          is_active?: boolean;
          model_params?: Json | null;
          created_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["model_registry"]["Insert"]>;
        Relationships: [];
      };
      sync_state: {
        Row: {
          cursor_at: string | null;
          duration_ms: number | null;
          error_msg: string | null;
          id: number;
          job_name: string;
          last_run_at: string | null;
          last_success_at: string | null;
          next_run_at: string | null;
          records_processed: number;
          schedule: string | null;
          source: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          cursor_at?: string | null;
          duration_ms?: number | null;
          error_msg?: string | null;
          id?: never;
          job_name: string;
          last_run_at?: string | null;
          last_success_at?: string | null;
          next_run_at?: string | null;
          records_processed?: number;
          schedule?: string | null;
          source?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["sync_state"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: {
      air_quality_latest: {
        Row: {
          id: number;
          province_id: string;
          observed_at: string;
          pm25: number | null;
          pm10: number | null;
          aqi: number | null;
          aqi_category: string | null;
          source: string;
          station_id: string | null;
          created_at: string | null;
        };
        Relationships: [];
      };
      weather_latest: {
        Row: {
          id: number;
          province_id: string;
          observed_at: string;
          temperature: number | null;
          humidity: number | null;
          wind_speed: number | null;
          wind_direction: number | null;
          precipitation: number | null;
          pressure: number | null;
          cloud_cover: number | null;
          visibility: number | null;
          source: string;
          created_at: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      aqi_category: { Args: { aqi: number }; Returns: string };
      fn_cleanup_old_data: { Args: Record<string, never>; Returns: Json };
      fn_generate_forecast: { Args: { p_horizon?: number }; Returns: number };
      pm25_to_aqi: { Args: { pm25: number }; Returns: number };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Update"];
export type Views<T extends keyof PublicSchema["Views"]> =
  PublicSchema["Views"][T]["Row"];
