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
      activity_data_changes: {
        Row: {
          action: string
          changed_fields: Json | null
          created_at: string | null
          id: string
          is_off_hours: boolean | null
          module: string | null
          new_values: Json | null
          old_values: Json | null
          record_id: string
          table_name: string
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          action: string
          changed_fields?: Json | null
          created_at?: string | null
          id?: string
          is_off_hours?: boolean | null
          module?: string | null
          new_values?: Json | null
          old_values?: Json | null
          record_id: string
          table_name: string
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          action?: string
          changed_fields?: Json | null
          created_at?: string | null
          id?: string
          is_off_hours?: boolean | null
          module?: string | null
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string
          table_name?: string
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: []
      }
      activity_page_views: {
        Row: {
          branch_id: string | null
          duration_seconds: number | null
          ended_at: string | null
          id: string
          module: string | null
          page_title: string | null
          route: string | null
          session_id: string | null
          started_at: string | null
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          branch_id?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          module?: string | null
          page_title?: string | null
          route?: string | null
          session_id?: string | null
          started_at?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          branch_id?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          module?: string | null
          page_title?: string | null
          route?: string | null
          session_id?: string | null
          started_at?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: []
      }
      activity_sessions: {
        Row: {
          ended_at: string | null
          id: string
          last_seen_at: string | null
          role: string | null
          session_id: string | null
          started_at: string | null
          user_agent: string | null
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          ended_at?: string | null
          id?: string
          last_seen_at?: string | null
          role?: string | null
          session_id?: string | null
          started_at?: string | null
          user_agent?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          ended_at?: string | null
          id?: string
          last_seen_at?: string | null
          role?: string | null
          session_id?: string | null
          started_at?: string | null
          user_agent?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: []
      }
      app_releases: {
        Row: {
          apk_path: string | null
          changelog: string | null
          created_at: string
          force_update: boolean
          id: string
          is_latest: boolean
          min_supported_version_code: number
          platform: string
          updated_at: string
          version_code: number
          version_name: string
        }
        Insert: {
          apk_path?: string | null
          changelog?: string | null
          created_at?: string
          force_update?: boolean
          id?: string
          is_latest?: boolean
          min_supported_version_code?: number
          platform?: string
          updated_at?: string
          version_code: number
          version_name: string
        }
        Update: {
          apk_path?: string | null
          changelog?: string | null
          created_at?: string
          force_update?: boolean
          id?: string
          is_latest?: boolean
          min_supported_version_code?: number
          platform?: string
          updated_at?: string
          version_code?: number
          version_name?: string
        }
        Relationships: []
      }
      appointment_reschedules: {
        Row: {
          appointment_id: string
          created_at: string
          id: string
          new_date: string
          new_end_time: string
          new_start_time: string
          old_date: string
          old_end_time: string
          old_start_time: string
          reason: string | null
          rescheduled_by: string | null
        }
        Insert: {
          appointment_id: string
          created_at?: string
          id?: string
          new_date: string
          new_end_time: string
          new_start_time: string
          old_date: string
          old_end_time: string
          old_start_time: string
          reason?: string | null
          rescheduled_by?: string | null
        }
        Update: {
          appointment_id?: string
          created_at?: string
          id?: string
          new_date?: string
          new_end_time?: string
          new_start_time?: string
          old_date?: string
          old_end_time?: string
          old_start_time?: string
          reason?: string | null
          rescheduled_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointment_reschedules_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          appointment_date: string
          assistant: string | null
          booked_by: string | null
          booked_by_name: string | null
          checkin_time: string | null
          checkout_time: string | null
          created_at: string
          created_from: string | null
          doctor: string | null
          end_time: string
          id: string
          lead_id: string | null
          notes: string | null
          patient_id: string
          source: string | null
          start_time: string
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          appointment_date: string
          assistant?: string | null
          booked_by?: string | null
          booked_by_name?: string | null
          checkin_time?: string | null
          checkout_time?: string | null
          created_at?: string
          created_from?: string | null
          doctor?: string | null
          end_time: string
          id?: string
          lead_id?: string | null
          notes?: string | null
          patient_id: string
          source?: string | null
          start_time: string
          status?: string
          type?: string
          updated_at?: string
        }
        Update: {
          appointment_date?: string
          assistant?: string | null
          booked_by?: string | null
          booked_by_name?: string | null
          checkin_time?: string | null
          checkout_time?: string | null
          created_at?: string
          created_from?: string | null
          doctor?: string | null
          end_time?: string
          id?: string
          lead_id?: string | null
          notes?: string | null
          patient_id?: string
          source?: string | null
          start_time?: string
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          asset_name: string
          assigned_date: string | null
          assigned_to: string | null
          category: string | null
          created_at: string
          id: string
          notes: string | null
          quantity: number
          status: string
          updated_at: string
        }
        Insert: {
          asset_name: string
          assigned_date?: string | null
          assigned_to?: string | null
          category?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          quantity?: number
          status?: string
          updated_at?: string
        }
        Update: {
          asset_name?: string
          assigned_date?: string | null
          assigned_to?: string | null
          category?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          quantity?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_audit: {
        Row: {
          action: string
          attendance_id: string | null
          created_at: string
          details: Json | null
          employee_id: string
          id: string
          performed_by: string | null
          updated_at: string
        }
        Insert: {
          action: string
          attendance_id?: string | null
          created_at?: string
          details?: Json | null
          employee_id: string
          id?: string
          performed_by?: string | null
          updated_at?: string
        }
        Update: {
          action?: string
          attendance_id?: string | null
          created_at?: string
          details?: Json | null
          employee_id?: string
          id?: string
          performed_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_audit_attendance_id_fkey"
            columns: ["attendance_id"]
            isOneToOne: false
            referencedRelation: "attendance_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_logs: {
        Row: {
          branch_id: string | null
          check_in: string | null
          check_in_at: string | null
          check_in_lat: number | null
          check_in_lng: number | null
          check_out: string | null
          check_out_at: string | null
          check_out_lat: number | null
          check_out_lng: number | null
          created_at: string
          created_by: string | null
          date: string
          employee_id: string
          hours_worked: number | null
          id: string
          late_entry: boolean
          manual_entry: boolean
          notes: string | null
          overtime_hours: number | null
          status: string
          updated_at: string
          worked_seconds: number
        }
        Insert: {
          branch_id?: string | null
          check_in?: string | null
          check_in_at?: string | null
          check_in_lat?: number | null
          check_in_lng?: number | null
          check_out?: string | null
          check_out_at?: string | null
          check_out_lat?: number | null
          check_out_lng?: number | null
          created_at?: string
          created_by?: string | null
          date?: string
          employee_id: string
          hours_worked?: number | null
          id?: string
          late_entry?: boolean
          manual_entry?: boolean
          notes?: string | null
          overtime_hours?: number | null
          status?: string
          updated_at?: string
          worked_seconds?: number
        }
        Update: {
          branch_id?: string | null
          check_in?: string | null
          check_in_at?: string | null
          check_in_lat?: number | null
          check_in_lng?: number | null
          check_out?: string | null
          check_out_at?: string | null
          check_out_lat?: number | null
          check_out_lng?: number | null
          created_at?: string
          created_by?: string | null
          date?: string
          employee_id?: string
          hours_worked?: number | null
          id?: string
          late_entry?: boolean
          manual_entry?: boolean
          notes?: string | null
          overtime_hours?: number | null
          status?: string
          updated_at?: string
          worked_seconds?: number
        }
        Relationships: [
          {
            foreignKeyName: "attendance_logs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_regularization_requests: {
        Row: {
          approved_hours: string | null
          claimed_hours: string | null
          created_at: string
          created_by: string | null
          employee_id: string
          id: string
          original_check_in: string | null
          original_check_out: string | null
          reject_reason: string | null
          remarks: string | null
          requested_check_in: string | null
          requested_check_out: string | null
          requested_date: string
          reviewed_at: string | null
          reviewed_by: string | null
          shift_details: string | null
          status: string
        }
        Insert: {
          approved_hours?: string | null
          claimed_hours?: string | null
          created_at?: string
          created_by?: string | null
          employee_id: string
          id?: string
          original_check_in?: string | null
          original_check_out?: string | null
          reject_reason?: string | null
          remarks?: string | null
          requested_check_in?: string | null
          requested_check_out?: string | null
          requested_date: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          shift_details?: string | null
          status?: string
        }
        Update: {
          approved_hours?: string | null
          claimed_hours?: string | null
          created_at?: string
          created_by?: string | null
          employee_id?: string
          id?: string
          original_check_in?: string | null
          original_check_out?: string | null
          reject_reason?: string | null
          remarks?: string | null
          requested_check_in?: string | null
          requested_check_out?: string | null
          requested_date?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          shift_details?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_regularization_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      awareness_content: {
        Row: {
          boost_spend: number
          caption: string | null
          comments: number
          content_format: string
          created_at: string
          created_by: string | null
          data_source: string
          enquiries: number
          external_id: string | null
          follower_gain: number
          id: string
          impressions: number
          likes: number
          notes: string | null
          permalink: string | null
          platform: string
          published_at: string
          reach: number
          shares: number
          title: string | null
          updated_at: string
        }
        Insert: {
          boost_spend?: number
          caption?: string | null
          comments?: number
          content_format?: string
          created_at?: string
          created_by?: string | null
          data_source?: string
          enquiries?: number
          external_id?: string | null
          follower_gain?: number
          id?: string
          impressions?: number
          likes?: number
          notes?: string | null
          permalink?: string | null
          platform: string
          published_at?: string
          reach?: number
          shares?: number
          title?: string | null
          updated_at?: string
        }
        Update: {
          boost_spend?: number
          caption?: string | null
          comments?: number
          content_format?: string
          created_at?: string
          created_by?: string | null
          data_source?: string
          enquiries?: number
          external_id?: string | null
          follower_gain?: number
          id?: string
          impressions?: number
          likes?: number
          notes?: string | null
          permalink?: string | null
          platform?: string
          published_at?: string
          reach?: number
          shares?: number
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      awareness_snapshots: {
        Row: {
          content_count: number
          created_at: string
          engagements: number
          followers: number
          id: string
          impressions: number
          platform: string
          raw: Json | null
          reach: number
          snapshot_date: string
          updated_at: string
        }
        Insert: {
          content_count?: number
          created_at?: string
          engagements?: number
          followers?: number
          id?: string
          impressions?: number
          platform: string
          raw?: Json | null
          reach?: number
          snapshot_date?: string
          updated_at?: string
        }
        Update: {
          content_count?: number
          created_at?: string
          engagements?: number
          followers?: number
          id?: string
          impressions?: number
          platform?: string
          raw?: Json | null
          reach?: number
          snapshot_date?: string
          updated_at?: string
        }
        Relationships: []
      }
      billing_items: {
        Row: {
          billing_id: string
          created_at: string
          description: string | null
          id: string
          quantity: number | null
          tooth_number: string | null
          total_price: number
          treatment_type: string
          unit_price: number
        }
        Insert: {
          billing_id: string
          created_at?: string
          description?: string | null
          id?: string
          quantity?: number | null
          tooth_number?: string | null
          total_price?: number
          treatment_type: string
          unit_price?: number
        }
        Update: {
          billing_id?: string
          created_at?: string
          description?: string | null
          id?: string
          quantity?: number | null
          tooth_number?: string | null
          total_price?: number
          treatment_type?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "billing_items_billing_id_fkey"
            columns: ["billing_id"]
            isOneToOne: false
            referencedRelation: "billings"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_payments: {
        Row: {
          amount: number
          billing_id: string
          created_at: string
          dedupe_key: string | null
          id: string
          notes: string | null
          patient_id: string | null
          payment_date: string
          payment_method: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          billing_id: string
          created_at?: string
          dedupe_key?: string | null
          id?: string
          notes?: string | null
          patient_id?: string | null
          payment_date?: string
          payment_method?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          billing_id?: string
          created_at?: string
          dedupe_key?: string | null
          id?: string
          notes?: string | null
          patient_id?: string | null
          payment_date?: string
          payment_method?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_payments_billing_id_fkey"
            columns: ["billing_id"]
            isOneToOne: false
            referencedRelation: "billings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_payments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      billings: {
        Row: {
          amount_paid: number | null
          checkin_id: string | null
          created_at: string
          discount_amount: number | null
          discount_percent: number | null
          id: string
          invoice_number: string | null
          notes: string | null
          patient_id: string
          payment_method: string | null
          payment_status: string
          plan_id: string | null
          subtotal: number
          tax_amount: number | null
          total_amount: number
          updated_at: string
        }
        Insert: {
          amount_paid?: number | null
          checkin_id?: string | null
          created_at?: string
          discount_amount?: number | null
          discount_percent?: number | null
          id?: string
          invoice_number?: string | null
          notes?: string | null
          patient_id: string
          payment_method?: string | null
          payment_status?: string
          plan_id?: string | null
          subtotal?: number
          tax_amount?: number | null
          total_amount?: number
          updated_at?: string
        }
        Update: {
          amount_paid?: number | null
          checkin_id?: string | null
          created_at?: string
          discount_amount?: number | null
          discount_percent?: number | null
          id?: string
          invoice_number?: string | null
          notes?: string | null
          patient_id?: string
          payment_method?: string | null
          payment_status?: string
          plan_id?: string | null
          subtotal?: number
          tax_amount?: number | null
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billings_checkin_id_fkey"
            columns: ["checkin_id"]
            isOneToOne: false
            referencedRelation: "patient_checkins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billings_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billings_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "treatment_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      blood_labs: {
        Row: {
          contact_person: string | null
          created_at: string
          id: string
          is_active: boolean
          location: string | null
          mobile: string | null
          name: string
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          contact_person?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          location?: string | null
          mobile?: string | null
          name: string
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          contact_person?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          location?: string | null
          mobile?: string | null
          name?: string
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      blood_tests: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      branch_expansion_plan: {
        Row: {
          break_even_month: number | null
          chairs_planned: number
          created_at: string
          expected_monthly_revenue: number
          expected_roi: number
          financial_year: string
          id: string
          investment_required: number
          launch_month: number
          new_branch_name: string
          notes: string | null
          status: string
          updated_at: string
        }
        Insert: {
          break_even_month?: number | null
          chairs_planned?: number
          created_at?: string
          expected_monthly_revenue?: number
          expected_roi?: number
          financial_year: string
          id?: string
          investment_required?: number
          launch_month: number
          new_branch_name: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          break_even_month?: number | null
          chairs_planned?: number
          created_at?: string
          expected_monthly_revenue?: number
          expected_roi?: number
          financial_year?: string
          id?: string
          investment_required?: number
          launch_month?: number
          new_branch_name?: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      branches: {
        Row: {
          address: string | null
          code: string
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          phone: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          address?: string | null
          code: string
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          phone?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          address?: string | null
          code?: string
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          phone?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      call_log_audit: {
        Row: {
          action: string
          actor_id: string | null
          call_log_id: string | null
          created_at: string
          details: Json
          device_id: string | null
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          call_log_id?: string | null
          created_at?: string
          details?: Json
          device_id?: string | null
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          call_log_id?: string | null
          created_at?: string
          details?: Json
          device_id?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_log_audit_call_log_id_fkey"
            columns: ["call_log_id"]
            isOneToOne: false
            referencedRelation: "call_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_log_audit_call_log_id_fkey"
            columns: ["call_log_id"]
            isOneToOne: false
            referencedRelation: "call_logs_unmatched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_log_audit_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "call_recording_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      call_logs: {
        Row: {
          call_type: string
          callyzer_environment: string | null
          callyzer_log_id: string | null
          client_uuid: string | null
          created_at: string
          device_id: string | null
          duplicate_of: string | null
          duration_seconds: number
          ended_at: string | null
          id: string
          lead_id: string | null
          manually_assigned: boolean
          match_method: string | null
          normalized_phone: string | null
          notes: string | null
          patient_id: string | null
          phone: string | null
          raw_call_type: string | null
          recording_path: string | null
          recording_size_bytes: number | null
          recording_uploaded_at: string | null
          sim_slot: number | null
          source: string
          started_at: string | null
          status: string
          telecaller_id: string | null
          updated_at: string
        }
        Insert: {
          call_type?: string
          callyzer_environment?: string | null
          callyzer_log_id?: string | null
          client_uuid?: string | null
          created_at?: string
          device_id?: string | null
          duplicate_of?: string | null
          duration_seconds?: number
          ended_at?: string | null
          id?: string
          lead_id?: string | null
          manually_assigned?: boolean
          match_method?: string | null
          normalized_phone?: string | null
          notes?: string | null
          patient_id?: string | null
          phone?: string | null
          raw_call_type?: string | null
          recording_path?: string | null
          recording_size_bytes?: number | null
          recording_uploaded_at?: string | null
          sim_slot?: number | null
          source?: string
          started_at?: string | null
          status?: string
          telecaller_id?: string | null
          updated_at?: string
        }
        Update: {
          call_type?: string
          callyzer_environment?: string | null
          callyzer_log_id?: string | null
          client_uuid?: string | null
          created_at?: string
          device_id?: string | null
          duplicate_of?: string | null
          duration_seconds?: number
          ended_at?: string | null
          id?: string
          lead_id?: string | null
          manually_assigned?: boolean
          match_method?: string | null
          normalized_phone?: string | null
          notes?: string | null
          patient_id?: string | null
          phone?: string | null
          raw_call_type?: string | null
          recording_path?: string | null
          recording_size_bytes?: number | null
          recording_uploaded_at?: string | null
          sim_slot?: number | null
          source?: string
          started_at?: string | null
          status?: string
          telecaller_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_logs_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "call_recording_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_logs_duplicate_of_fkey"
            columns: ["duplicate_of"]
            isOneToOne: false
            referencedRelation: "call_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_logs_duplicate_of_fkey"
            columns: ["duplicate_of"]
            isOneToOne: false
            referencedRelation: "call_logs_unmatched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_logs_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      call_recording_devices: {
        Row: {
          android_version: string | null
          app_version: string | null
          app_version_code: number | null
          approved_at: string | null
          approved_by: string | null
          battery_optimization_exempt: boolean | null
          consecutive_sync_failures: number
          created_at: string
          device_model: string | null
          device_uuid: string
          id: string
          last_audio_sync_at: string | null
          last_call_detected_at: string | null
          last_metadata_sync_at: string | null
          last_seen_at: string | null
          manufacturer: string | null
          notes: string | null
          pending_audio: number
          pending_events: number
          permission_state: Json
          recording_capability: string
          service_alive: boolean | null
          session_revoked_at: string | null
          sim_slot_filter: number | null
          staff_phone: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          android_version?: string | null
          app_version?: string | null
          app_version_code?: number | null
          approved_at?: string | null
          approved_by?: string | null
          battery_optimization_exempt?: boolean | null
          consecutive_sync_failures?: number
          created_at?: string
          device_model?: string | null
          device_uuid: string
          id?: string
          last_audio_sync_at?: string | null
          last_call_detected_at?: string | null
          last_metadata_sync_at?: string | null
          last_seen_at?: string | null
          manufacturer?: string | null
          notes?: string | null
          pending_audio?: number
          pending_events?: number
          permission_state?: Json
          recording_capability?: string
          service_alive?: boolean | null
          session_revoked_at?: string | null
          sim_slot_filter?: number | null
          staff_phone?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          android_version?: string | null
          app_version?: string | null
          app_version_code?: number | null
          approved_at?: string | null
          approved_by?: string | null
          battery_optimization_exempt?: boolean | null
          consecutive_sync_failures?: number
          created_at?: string
          device_model?: string | null
          device_uuid?: string
          id?: string
          last_audio_sync_at?: string | null
          last_call_detected_at?: string | null
          last_metadata_sync_at?: string | null
          last_seen_at?: string | null
          manufacturer?: string | null
          notes?: string | null
          pending_audio?: number
          pending_events?: number
          permission_state?: Json
          recording_capability?: string
          service_alive?: boolean | null
          session_revoked_at?: string | null
          sim_slot_filter?: number | null
          staff_phone?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      callyzer_call_recordings: {
        Row: {
          call_log_id: string
          created_at: string
          environment: string | null
          id: string
          recording_url: string
        }
        Insert: {
          call_log_id: string
          created_at?: string
          environment?: string | null
          id?: string
          recording_url: string
        }
        Update: {
          call_log_id?: string
          created_at?: string
          environment?: string | null
          id?: string
          recording_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "callyzer_call_recordings_call_log_id_fkey"
            columns: ["call_log_id"]
            isOneToOne: true
            referencedRelation: "call_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "callyzer_call_recordings_call_log_id_fkey"
            columns: ["call_log_id"]
            isOneToOne: true
            referencedRelation: "call_logs_unmatched"
            referencedColumns: ["id"]
          },
        ]
      }
      callyzer_employee_mappings: {
        Row: {
          callyzer_emp_name: string | null
          callyzer_emp_number: string
          created_at: string
          employee_id: string | null
          id: string
          is_active: boolean
          profile_id: string | null
          updated_at: string
        }
        Insert: {
          callyzer_emp_name?: string | null
          callyzer_emp_number: string
          created_at?: string
          employee_id?: string | null
          id?: string
          is_active?: boolean
          profile_id?: string | null
          updated_at?: string
        }
        Update: {
          callyzer_emp_name?: string | null
          callyzer_emp_number?: string
          created_at?: string
          employee_id?: string | null
          id?: string
          is_active?: boolean
          profile_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "callyzer_employee_mappings_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "callyzer_employee_mappings_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      callyzer_settings: {
        Row: {
          created_at: string
          environment: string
          id: string
          ignore_unmapped_employees: boolean
          is_enabled: boolean
          last_backfill_at: string | null
          last_verified_at: string | null
          last_verify_error: string | null
          last_webhook_at: string | null
          production_api_version: string
          production_base_url: string | null
          production_daywise_path: string
          production_history_by_id_path: string
          production_history_path: string
          sandbox_api_version: string
          sandbox_base_url: string | null
          sandbox_daywise_path: string
          sandbox_history_by_id_path: string
          sandbox_history_path: string
          sandbox_window_from: string
          sandbox_window_to: string
          updated_at: string
          webhook_secret: string | null
        }
        Insert: {
          created_at?: string
          environment?: string
          id?: string
          ignore_unmapped_employees?: boolean
          is_enabled?: boolean
          last_backfill_at?: string | null
          last_verified_at?: string | null
          last_verify_error?: string | null
          last_webhook_at?: string | null
          production_api_version?: string
          production_base_url?: string | null
          production_daywise_path?: string
          production_history_by_id_path?: string
          production_history_path?: string
          sandbox_api_version?: string
          sandbox_base_url?: string | null
          sandbox_daywise_path?: string
          sandbox_history_by_id_path?: string
          sandbox_history_path?: string
          sandbox_window_from?: string
          sandbox_window_to?: string
          updated_at?: string
          webhook_secret?: string | null
        }
        Update: {
          created_at?: string
          environment?: string
          id?: string
          ignore_unmapped_employees?: boolean
          is_enabled?: boolean
          last_backfill_at?: string | null
          last_verified_at?: string | null
          last_verify_error?: string | null
          last_webhook_at?: string | null
          production_api_version?: string
          production_base_url?: string | null
          production_daywise_path?: string
          production_history_by_id_path?: string
          production_history_path?: string
          sandbox_api_version?: string
          sandbox_base_url?: string | null
          sandbox_daywise_path?: string
          sandbox_history_by_id_path?: string
          sandbox_history_path?: string
          sandbox_window_from?: string
          sandbox_window_to?: string
          updated_at?: string
          webhook_secret?: string | null
        }
        Relationships: []
      }
      callyzer_unmatched_calls: {
        Row: {
          call_log_id: string | null
          callyzer_emp_number: string | null
          created_at: string
          environment: string | null
          id: string
          normalized_phone: string | null
          phone: string | null
          resolved: boolean
        }
        Insert: {
          call_log_id?: string | null
          callyzer_emp_number?: string | null
          created_at?: string
          environment?: string | null
          id?: string
          normalized_phone?: string | null
          phone?: string | null
          resolved?: boolean
        }
        Update: {
          call_log_id?: string | null
          callyzer_emp_number?: string | null
          created_at?: string
          environment?: string | null
          id?: string
          normalized_phone?: string | null
          phone?: string | null
          resolved?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "callyzer_unmatched_calls_call_log_id_fkey"
            columns: ["call_log_id"]
            isOneToOne: false
            referencedRelation: "call_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "callyzer_unmatched_calls_call_log_id_fkey"
            columns: ["call_log_id"]
            isOneToOne: false
            referencedRelation: "call_logs_unmatched"
            referencedColumns: ["id"]
          },
        ]
      }
      callyzer_webhook_logs: {
        Row: {
          environment: string | null
          id: string
          logs_inserted: number
          logs_received: number
          logs_skipped: number
          logs_updated: number
          message: string | null
          payload: Json | null
          received_at: string
          status: string
          unknown_call_types: string[] | null
        }
        Insert: {
          environment?: string | null
          id?: string
          logs_inserted?: number
          logs_received?: number
          logs_skipped?: number
          logs_updated?: number
          message?: string | null
          payload?: Json | null
          received_at?: string
          status?: string
          unknown_call_types?: string[] | null
        }
        Update: {
          environment?: string | null
          id?: string
          logs_inserted?: number
          logs_received?: number
          logs_skipped?: number
          logs_updated?: number
          message?: string | null
          payload?: Json | null
          received_at?: string
          status?: string
          unknown_call_types?: string[] | null
        }
        Relationships: []
      }
      campaign_coupons: {
        Row: {
          campaign_id: string
          coupon_code: string | null
          created_at: string
          discount_percentage: number | null
          expiry_date: string | null
          id: string
          lead_id: string
          offer_type: string | null
          redeemed: boolean | null
          redeemed_date: string | null
          sent_via_whatsapp: boolean
          whatsapp_sent_at: string | null
        }
        Insert: {
          campaign_id: string
          coupon_code?: string | null
          created_at?: string
          discount_percentage?: number | null
          expiry_date?: string | null
          id?: string
          lead_id: string
          offer_type?: string | null
          redeemed?: boolean | null
          redeemed_date?: string | null
          sent_via_whatsapp?: boolean
          whatsapp_sent_at?: string | null
        }
        Update: {
          campaign_id?: string
          coupon_code?: string | null
          created_at?: string
          discount_percentage?: number | null
          expiry_date?: string | null
          id?: string
          lead_id?: string
          offer_type?: string | null
          redeemed?: boolean | null
          redeemed_date?: string | null
          sent_via_whatsapp?: boolean
          whatsapp_sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_coupons_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_coupons_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "screening_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_followups: {
        Row: {
          campaign_id: string
          created_at: string
          followup_type: string
          id: string
          lead_id: string
          notes: string | null
          scheduled_date: string
          sent_at: string | null
          status: string | null
        }
        Insert: {
          campaign_id: string
          created_at?: string
          followup_type: string
          id?: string
          lead_id: string
          notes?: string | null
          scheduled_date: string
          sent_at?: string | null
          status?: string | null
        }
        Update: {
          campaign_id?: string
          created_at?: string
          followup_type?: string
          id?: string
          lead_id?: string
          notes?: string | null
          scheduled_date?: string
          sent_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_followups_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_followups_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "screening_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          actual_cost: number | null
          approval_status: string | null
          assistant_assigned: string | null
          assistant_type: string | null
          camp_code: string | null
          campaign_date: string | null
          campaign_status: string
          campaign_type: string
          checklist: Json | null
          coordinator_assigned: string | null
          coordinator_contact: string | null
          created_at: string
          doctor_assigned: string | null
          doctor_type: string | null
          estimated_cost: number | null
          expected_participants: number | null
          guest_assistant_contact: string | null
          guest_assistant_name: string | null
          guest_doctor_contact: string | null
          guest_doctor_name: string | null
          guest_doctor_specialization: string | null
          id: string
          institution_id: string | null
          lead_seq: number
          name: string
          notes: string | null
          objective: string | null
          qr_enabled: boolean
          updated_at: string
        }
        Insert: {
          actual_cost?: number | null
          approval_status?: string | null
          assistant_assigned?: string | null
          assistant_type?: string | null
          camp_code?: string | null
          campaign_date?: string | null
          campaign_status?: string
          campaign_type?: string
          checklist?: Json | null
          coordinator_assigned?: string | null
          coordinator_contact?: string | null
          created_at?: string
          doctor_assigned?: string | null
          doctor_type?: string | null
          estimated_cost?: number | null
          expected_participants?: number | null
          guest_assistant_contact?: string | null
          guest_assistant_name?: string | null
          guest_doctor_contact?: string | null
          guest_doctor_name?: string | null
          guest_doctor_specialization?: string | null
          id?: string
          institution_id?: string | null
          lead_seq?: number
          name: string
          notes?: string | null
          objective?: string | null
          qr_enabled?: boolean
          updated_at?: string
        }
        Update: {
          actual_cost?: number | null
          approval_status?: string | null
          assistant_assigned?: string | null
          assistant_type?: string | null
          camp_code?: string | null
          campaign_date?: string | null
          campaign_status?: string
          campaign_type?: string
          checklist?: Json | null
          coordinator_assigned?: string | null
          coordinator_contact?: string | null
          created_at?: string
          doctor_assigned?: string | null
          doctor_type?: string | null
          estimated_cost?: number | null
          expected_participants?: number | null
          guest_assistant_contact?: string | null
          guest_assistant_name?: string | null
          guest_doctor_contact?: string | null
          guest_doctor_name?: string | null
          guest_doctor_specialization?: string | null
          id?: string
          institution_id?: string | null
          lead_seq?: number
          name?: string
          notes?: string | null
          objective?: string | null
          qr_enabled?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_drawer_days: {
        Row: {
          cash_received: number | null
          closed_by: string | null
          closed_by_name: string | null
          closing_denominations: Json | null
          closing_time: string | null
          closing_total: number | null
          created_at: string
          drawer_date: string
          id: string
          notes: string | null
          opened_by: string | null
          opened_by_name: string | null
          opening_denominations: Json
          opening_time: string | null
          opening_total: number
          updated_at: string
        }
        Insert: {
          cash_received?: number | null
          closed_by?: string | null
          closed_by_name?: string | null
          closing_denominations?: Json | null
          closing_time?: string | null
          closing_total?: number | null
          created_at?: string
          drawer_date: string
          id?: string
          notes?: string | null
          opened_by?: string | null
          opened_by_name?: string | null
          opening_denominations?: Json
          opening_time?: string | null
          opening_total?: number
          updated_at?: string
        }
        Update: {
          cash_received?: number | null
          closed_by?: string | null
          closed_by_name?: string | null
          closing_denominations?: Json | null
          closing_time?: string | null
          closing_total?: number | null
          created_at?: string
          drawer_date?: string
          id?: string
          notes?: string | null
          opened_by?: string | null
          opened_by_name?: string | null
          opening_denominations?: Json
          opening_time?: string | null
          opening_total?: number
          updated_at?: string
        }
        Relationships: []
      }
      cash_drawer_expenses: {
        Row: {
          amount: number
          approved_by: string | null
          approved_by_name: string | null
          created_at: string
          drawer_day_id: string
          entered_by: string | null
          entered_by_name: string | null
          expense_date: string
          id: string
          reason: string
          updated_at: string
        }
        Insert: {
          amount: number
          approved_by?: string | null
          approved_by_name?: string | null
          created_at?: string
          drawer_day_id: string
          entered_by?: string | null
          entered_by_name?: string | null
          expense_date: string
          id?: string
          reason: string
          updated_at?: string
        }
        Update: {
          amount?: number
          approved_by?: string | null
          approved_by_name?: string | null
          created_at?: string
          drawer_day_id?: string
          entered_by?: string | null
          entered_by_name?: string | null
          expense_date?: string
          id?: string
          reason?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_drawer_expenses_drawer_day_id_fkey"
            columns: ["drawer_day_id"]
            isOneToOne: false
            referencedRelation: "cash_drawer_days"
            referencedColumns: ["id"]
          },
        ]
      }
      chair_utilization_projection: {
        Row: {
          available_hours: number | null
          branch_id: string | null
          created_at: string
          expected_patient_load: number
          expected_revenue_per_chair: number
          financial_year: string
          id: string
          month: number
          target_utilization_percent: number
          total_chairs: number
          updated_at: string
          working_days: number
          working_hours_per_day: number
        }
        Insert: {
          available_hours?: number | null
          branch_id?: string | null
          created_at?: string
          expected_patient_load?: number
          expected_revenue_per_chair?: number
          financial_year: string
          id?: string
          month: number
          target_utilization_percent?: number
          total_chairs?: number
          updated_at?: string
          working_days?: number
          working_hours_per_day?: number
        }
        Update: {
          available_hours?: number | null
          branch_id?: string | null
          created_at?: string
          expected_patient_load?: number
          expected_revenue_per_chair?: number
          financial_year?: string
          id?: string
          month?: number
          target_utilization_percent?: number
          total_chairs?: number
          updated_at?: string
          working_days?: number
          working_hours_per_day?: number
        }
        Relationships: [
          {
            foreignKeyName: "chair_utilization_projection_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_brands: {
        Row: {
          contact_number: string | null
          created_at: string
          id: string
          is_active: boolean
          location: string | null
          name: string
          rep_name: string | null
          updated_at: string
        }
        Insert: {
          contact_number?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          location?: string | null
          name: string
          rep_name?: string | null
          updated_at?: string
        }
        Update: {
          contact_number?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          location?: string | null
          name?: string
          rep_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      clinic_settings: {
        Row: {
          address: string | null
          appointment_reminder_auto: boolean | null
          birthday_wishes: boolean | null
          clinic_name: string | null
          created_at: string
          email: string | null
          follow_up_reminder_auto: boolean | null
          geofence_lat: number | null
          geofence_lng: number | null
          geofence_radius_meters: number | null
          google_review_link: string | null
          id: string
          lab_order_updates_to_patient: boolean | null
          logo_url: string | null
          phone: string | null
          seal_url: string | null
          show_finance_obstacles: boolean | null
          show_pending_balance_on_invoice: boolean | null
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          appointment_reminder_auto?: boolean | null
          birthday_wishes?: boolean | null
          clinic_name?: string | null
          created_at?: string
          email?: string | null
          follow_up_reminder_auto?: boolean | null
          geofence_lat?: number | null
          geofence_lng?: number | null
          geofence_radius_meters?: number | null
          google_review_link?: string | null
          id?: string
          lab_order_updates_to_patient?: boolean | null
          logo_url?: string | null
          phone?: string | null
          seal_url?: string | null
          show_finance_obstacles?: boolean | null
          show_pending_balance_on_invoice?: boolean | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          appointment_reminder_auto?: boolean | null
          birthday_wishes?: boolean | null
          clinic_name?: string | null
          created_at?: string
          email?: string | null
          follow_up_reminder_auto?: boolean | null
          geofence_lat?: number | null
          geofence_lng?: number | null
          geofence_radius_meters?: number | null
          google_review_link?: string | null
          id?: string
          lab_order_updates_to_patient?: boolean | null
          logo_url?: string | null
          phone?: string | null
          seal_url?: string | null
          show_finance_obstacles?: boolean | null
          show_pending_balance_on_invoice?: boolean | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      clinic_treatments: {
        Row: {
          charge: number
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          charge?: number
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          charge?: number
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      clinical_photos: {
        Row: {
          checkin_id: string | null
          created_at: string
          file_name: string | null
          file_path: string
          id: string
          notes: string | null
          patient_id: string
          photo_type: string
          tooth_number: number | null
        }
        Insert: {
          checkin_id?: string | null
          created_at?: string
          file_name?: string | null
          file_path: string
          id?: string
          notes?: string | null
          patient_id: string
          photo_type?: string
          tooth_number?: number | null
        }
        Update: {
          checkin_id?: string | null
          created_at?: string
          file_name?: string | null
          file_path?: string
          id?: string
          notes?: string | null
          patient_id?: string
          photo_type?: string
          tooth_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "clinical_photos_checkin_id_fkey"
            columns: ["checkin_id"]
            isOneToOne: false
            referencedRelation: "patient_checkins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_photos_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      comp_off_requests: {
        Row: {
          admin_comment: string | null
          approved_by: string | null
          created_at: string
          duration_type: string
          employee_id: string
          expiry_date: string | null
          id: string
          reason: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          working_date: string
          year: number
        }
        Insert: {
          admin_comment?: string | null
          approved_by?: string | null
          created_at?: string
          duration_type?: string
          employee_id: string
          expiry_date?: string | null
          id?: string
          reason?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          working_date: string
          year: number
        }
        Update: {
          admin_comment?: string | null
          approved_by?: string | null
          created_at?: string
          duration_type?: string
          employee_id?: string
          expiry_date?: string | null
          id?: string
          reason?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          working_date?: string
          year?: number
        }
        Relationships: []
      }
      connected_apps: {
        Row: {
          access_token: string | null
          app_credentials: Json | null
          connected_at: string | null
          created_at: string | null
          id: string
          is_connected: boolean | null
          metadata: Json | null
          platform: string
          platform_user_id: string | null
          platform_username: string | null
          refresh_token: string | null
          token_expires_at: string | null
          updated_at: string | null
          user_id: string
          verified_at: string | null
        }
        Insert: {
          access_token?: string | null
          app_credentials?: Json | null
          connected_at?: string | null
          created_at?: string | null
          id?: string
          is_connected?: boolean | null
          metadata?: Json | null
          platform: string
          platform_user_id?: string | null
          platform_username?: string | null
          refresh_token?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          user_id: string
          verified_at?: string | null
        }
        Update: {
          access_token?: string | null
          app_credentials?: Json | null
          connected_at?: string | null
          created_at?: string | null
          id?: string
          is_connected?: boolean | null
          metadata?: Json | null
          platform?: string
          platform_user_id?: string | null
          platform_username?: string | null
          refresh_token?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          user_id?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      consultation_findings: {
        Row: {
          appointment_id: string | null
          chart_entry_id: string | null
          chart_id: string | null
          checkin_id: string | null
          condition: string
          created_at: string
          created_by: string | null
          current_status: string
          diagnosis: string | null
          doctor: string | null
          id: string
          is_active: boolean
          last_updated_at: string
          linked_treatment_plan_item_id: string | null
          notes: string | null
          parent_finding_id: string | null
          patient_id: string
          recorded_at: string
          surface: string | null
          tooth_number: number | null
          treatment_needed: string | null
        }
        Insert: {
          appointment_id?: string | null
          chart_entry_id?: string | null
          chart_id?: string | null
          checkin_id?: string | null
          condition: string
          created_at?: string
          created_by?: string | null
          current_status?: string
          diagnosis?: string | null
          doctor?: string | null
          id?: string
          is_active?: boolean
          last_updated_at?: string
          linked_treatment_plan_item_id?: string | null
          notes?: string | null
          parent_finding_id?: string | null
          patient_id: string
          recorded_at?: string
          surface?: string | null
          tooth_number?: number | null
          treatment_needed?: string | null
        }
        Update: {
          appointment_id?: string | null
          chart_entry_id?: string | null
          chart_id?: string | null
          checkin_id?: string | null
          condition?: string
          created_at?: string
          created_by?: string | null
          current_status?: string
          diagnosis?: string | null
          doctor?: string | null
          id?: string
          is_active?: boolean
          last_updated_at?: string
          linked_treatment_plan_item_id?: string | null
          notes?: string | null
          parent_finding_id?: string | null
          patient_id?: string
          recorded_at?: string
          surface?: string | null
          tooth_number?: number | null
          treatment_needed?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consultation_findings_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultation_findings_chart_entry_id_fkey"
            columns: ["chart_entry_id"]
            isOneToOne: false
            referencedRelation: "dental_chart_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultation_findings_chart_id_fkey"
            columns: ["chart_id"]
            isOneToOne: false
            referencedRelation: "dental_charts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultation_findings_checkin_id_fkey"
            columns: ["checkin_id"]
            isOneToOne: false
            referencedRelation: "patient_checkins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultation_findings_linked_treatment_plan_item_id_fkey"
            columns: ["linked_treatment_plan_item_id"]
            isOneToOne: false
            referencedRelation: "treatment_plan_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultation_findings_parent_finding_id_fkey"
            columns: ["parent_finding_id"]
            isOneToOne: false
            referencedRelation: "consultation_findings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultation_findings_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      content_calendar: {
        Row: {
          ai_generated: boolean
          caption: string | null
          category: string | null
          content_type: string
          created_at: string
          edit_by: string | null
          edit_status: string | null
          engagement_score: number | null
          hashtags: string | null
          hook: string | null
          id: string
          platform: string
          post_status: string | null
          posted_by: string | null
          remarks: string | null
          scheduled_date: string | null
          scheduled_time: string | null
          script_by: string | null
          script_status: string | null
          shoot_by: string | null
          shoot_status: string | null
          status: string
          title: string
          topic: string | null
          updated_at: string
        }
        Insert: {
          ai_generated?: boolean
          caption?: string | null
          category?: string | null
          content_type?: string
          created_at?: string
          edit_by?: string | null
          edit_status?: string | null
          engagement_score?: number | null
          hashtags?: string | null
          hook?: string | null
          id?: string
          platform?: string
          post_status?: string | null
          posted_by?: string | null
          remarks?: string | null
          scheduled_date?: string | null
          scheduled_time?: string | null
          script_by?: string | null
          script_status?: string | null
          shoot_by?: string | null
          shoot_status?: string | null
          status?: string
          title: string
          topic?: string | null
          updated_at?: string
        }
        Update: {
          ai_generated?: boolean
          caption?: string | null
          category?: string | null
          content_type?: string
          created_at?: string
          edit_by?: string | null
          edit_status?: string | null
          engagement_score?: number | null
          hashtags?: string | null
          hook?: string | null
          id?: string
          platform?: string
          post_status?: string | null
          posted_by?: string | null
          remarks?: string | null
          scheduled_date?: string | null
          scheduled_time?: string | null
          script_by?: string | null
          script_status?: string | null
          shoot_by?: string | null
          shoot_status?: string | null
          status?: string
          title?: string
          topic?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      corporate_partnerships: {
        Row: {
          annual_dental_package: boolean | null
          company_name: string
          contract_renewal_date: string | null
          contract_start_date: string | null
          created_at: string
          csr_collaboration: boolean | null
          employee_coverage_count: number | null
          id: string
          insurance_supported: boolean | null
          notes: string | null
          partner_status: string | null
          updated_at: string
          visit_frequency: string | null
        }
        Insert: {
          annual_dental_package?: boolean | null
          company_name: string
          contract_renewal_date?: string | null
          contract_start_date?: string | null
          created_at?: string
          csr_collaboration?: boolean | null
          employee_coverage_count?: number | null
          id?: string
          insurance_supported?: boolean | null
          notes?: string | null
          partner_status?: string | null
          updated_at?: string
          visit_frequency?: string | null
        }
        Update: {
          annual_dental_package?: boolean | null
          company_name?: string
          contract_renewal_date?: string | null
          contract_start_date?: string | null
          created_at?: string
          csr_collaboration?: boolean | null
          employee_coverage_count?: number | null
          id?: string
          insurance_supported?: boolean | null
          notes?: string | null
          partner_status?: string | null
          updated_at?: string
          visit_frequency?: string | null
        }
        Relationships: []
      }
      custom_roles: {
        Row: {
          created_at: string
          department: string
          description: string | null
          display_label: string
          hierarchy_level: string
          id: string
          is_active: boolean
          is_system: boolean
          reports_to: string | null
          role_key: string
          sort_order: number
          sub_team: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          department?: string
          description?: string | null
          display_label: string
          hierarchy_level?: string
          id?: string
          is_active?: boolean
          is_system?: boolean
          reports_to?: string | null
          role_key: string
          sort_order?: number
          sub_team?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          department?: string
          description?: string | null
          display_label?: string
          hierarchy_level?: string
          id?: string
          is_active?: boolean
          is_system?: boolean
          reports_to?: string | null
          role_key?: string
          sort_order?: number
          sub_team?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_roles_reports_to_fkey"
            columns: ["reports_to"]
            isOneToOne: false
            referencedRelation: "custom_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      dental_assistants: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      dental_chart_entries: {
        Row: {
          chart_id: string
          condition: string
          created_at: string
          id: string
          notes: string | null
          surface: string | null
          tooth_number: number
          treatment_needed: string | null
        }
        Insert: {
          chart_id: string
          condition?: string
          created_at?: string
          id?: string
          notes?: string | null
          surface?: string | null
          tooth_number: number
          treatment_needed?: string | null
        }
        Update: {
          chart_id?: string
          condition?: string
          created_at?: string
          id?: string
          notes?: string | null
          surface?: string | null
          tooth_number?: number
          treatment_needed?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dental_chart_entries_chart_id_fkey"
            columns: ["chart_id"]
            isOneToOne: false
            referencedRelation: "dental_charts"
            referencedColumns: ["id"]
          },
        ]
      }
      dental_charts: {
        Row: {
          chart_type: string
          checkin_id: string | null
          created_at: string
          id: string
          notes: string | null
          patient_id: string
          updated_at: string
        }
        Insert: {
          chart_type?: string
          checkin_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          patient_id: string
          updated_at?: string
        }
        Update: {
          chart_type?: string
          checkin_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          patient_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dental_charts_checkin_id_fkey"
            columns: ["checkin_id"]
            isOneToOne: false
            referencedRelation: "patient_checkins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dental_charts_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      department_projection_targets: {
        Row: {
          avg_case_value_target: number
          branch_id: string | null
          conversion_target: number
          created_at: string
          department_name: string
          financial_year: string
          id: string
          monthly_target: number
          quarterly_target: number
          responsible_staff: string | null
          updated_at: string
          yearly_target: number
        }
        Insert: {
          avg_case_value_target?: number
          branch_id?: string | null
          conversion_target?: number
          created_at?: string
          department_name: string
          financial_year: string
          id?: string
          monthly_target?: number
          quarterly_target?: number
          responsible_staff?: string | null
          updated_at?: string
          yearly_target?: number
        }
        Update: {
          avg_case_value_target?: number
          branch_id?: string | null
          conversion_target?: number
          created_at?: string
          department_name?: string
          financial_year?: string
          id?: string
          monthly_target?: number
          quarterly_target?: number
          responsible_staff?: string | null
          updated_at?: string
          yearly_target?: number
        }
        Relationships: [
          {
            foreignKeyName: "department_projection_targets_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      department_roles: {
        Row: {
          created_at: string
          department: string
          display_label: string
          id: string
          is_active: boolean
          role_name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          department: string
          display_label: string
          id?: string
          is_active?: boolean
          role_name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          department?: string
          display_label?: string
          id?: string
          is_active?: boolean
          role_name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      departments: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      deposit_invoices: {
        Row: {
          amount: number
          billing_id: string
          created_at: string
          deposit_id: string
          id: string
        }
        Insert: {
          amount?: number
          billing_id: string
          created_at?: string
          deposit_id: string
          id?: string
        }
        Update: {
          amount?: number
          billing_id?: string
          created_at?: string
          deposit_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deposit_invoices_billing_id_fkey"
            columns: ["billing_id"]
            isOneToOne: true
            referencedRelation: "billings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deposit_invoices_deposit_id_fkey"
            columns: ["deposit_id"]
            isOneToOne: false
            referencedRelation: "deposits"
            referencedColumns: ["id"]
          },
        ]
      }
      deposits: {
        Row: {
          account_number: string | null
          account_type: string | null
          bank_account: string
          bank_branch_name: string | null
          bank_reference: string | null
          challan_number: string | null
          created_at: string
          created_by: string | null
          deposit_amount: number
          deposit_branch_name: string | null
          deposit_date: string
          deposit_mode: string
          deposit_no: string
          deposit_way: string | null
          deposited_by: string
          drawer_date: string | null
          id: string
          ifsc_code: string | null
          reference_number: string | null
          referral_code: string | null
          remarks: string | null
          slip_path: string | null
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          account_number?: string | null
          account_type?: string | null
          bank_account: string
          bank_branch_name?: string | null
          bank_reference?: string | null
          challan_number?: string | null
          created_at?: string
          created_by?: string | null
          deposit_amount?: number
          deposit_branch_name?: string | null
          deposit_date: string
          deposit_mode: string
          deposit_no: string
          deposit_way?: string | null
          deposited_by: string
          drawer_date?: string | null
          id?: string
          ifsc_code?: string | null
          reference_number?: string | null
          referral_code?: string | null
          remarks?: string | null
          slip_path?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Update: {
          account_number?: string | null
          account_type?: string | null
          bank_account?: string
          bank_branch_name?: string | null
          bank_reference?: string | null
          challan_number?: string | null
          created_at?: string
          created_by?: string | null
          deposit_amount?: number
          deposit_branch_name?: string | null
          deposit_date?: string
          deposit_mode?: string
          deposit_no?: string
          deposit_way?: string | null
          deposited_by?: string
          drawer_date?: string | null
          id?: string
          ifsc_code?: string | null
          reference_number?: string | null
          referral_code?: string | null
          remarks?: string | null
          slip_path?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      diagnostic_orders: {
        Row: {
          appointment_id: string | null
          blood_lab: string | null
          category: string
          cost: number | null
          created_at: string
          doctor: string | null
          id: string
          notes: string | null
          patient_id: string
          report_received_at: string | null
          report_sizes: Json | null
          report_url: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sample_collected_at: string | null
          scan_center: string | null
          source: string | null
          status: string
          tests: Json
          updated_at: string
        }
        Insert: {
          appointment_id?: string | null
          blood_lab?: string | null
          category: string
          cost?: number | null
          created_at?: string
          doctor?: string | null
          id?: string
          notes?: string | null
          patient_id: string
          report_received_at?: string | null
          report_sizes?: Json | null
          report_url?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sample_collected_at?: string | null
          scan_center?: string | null
          source?: string | null
          status?: string
          tests?: Json
          updated_at?: string
        }
        Update: {
          appointment_id?: string | null
          blood_lab?: string | null
          category?: string
          cost?: number | null
          created_at?: string
          doctor?: string | null
          id?: string
          notes?: string | null
          patient_id?: string
          report_received_at?: string | null
          report_sizes?: Json | null
          report_url?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sample_collected_at?: string | null
          scan_center?: string | null
          source?: string | null
          status?: string
          tests?: Json
          updated_at?: string
        }
        Relationships: []
      }
      districts: {
        Row: {
          country: string | null
          created_at: string
          id: string
          name: string
          state: string | null
        }
        Insert: {
          country?: string | null
          created_at?: string
          id?: string
          name: string
          state?: string | null
        }
        Update: {
          country?: string | null
          created_at?: string
          id?: string
          name?: string
          state?: string | null
        }
        Relationships: []
      }
      doctor_quality_logs: {
        Row: {
          action_taken: string | null
          created_at: string
          doctor_name: string
          id: string
          issue_description: string
          issue_type: string
          notes: string | null
          patient_id: string | null
          patient_name: string
          review_date: string
          review_month: number | null
          review_week: number | null
          review_year: number | null
          severity: string
          status: string
          tooth_number: number | null
          treatment_type: string
        }
        Insert: {
          action_taken?: string | null
          created_at?: string
          doctor_name: string
          id?: string
          issue_description: string
          issue_type?: string
          notes?: string | null
          patient_id?: string | null
          patient_name: string
          review_date?: string
          review_month?: number | null
          review_week?: number | null
          review_year?: number | null
          severity?: string
          status?: string
          tooth_number?: number | null
          treatment_type: string
        }
        Update: {
          action_taken?: string | null
          created_at?: string
          doctor_name?: string
          id?: string
          issue_description?: string
          issue_type?: string
          notes?: string | null
          patient_id?: string | null
          patient_name?: string
          review_date?: string
          review_month?: number | null
          review_week?: number | null
          review_year?: number | null
          severity?: string
          status?: string
          tooth_number?: number | null
          treatment_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctor_quality_logs_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      doctors: {
        Row: {
          appointment_type: string | null
          consultant_fee: number
          created_at: string
          custom_duration: string | null
          id: string
          is_active: boolean
          mobile: string | null
          name: string
          schedule_frequency: string | null
          send_schedule_sms: boolean | null
          send_schedule_whatsapp: boolean | null
          specialization: string | null
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          appointment_type?: string | null
          consultant_fee?: number
          created_at?: string
          custom_duration?: string | null
          id?: string
          is_active?: boolean
          mobile?: string | null
          name: string
          schedule_frequency?: string | null
          send_schedule_sms?: boolean | null
          send_schedule_whatsapp?: boolean | null
          specialization?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          appointment_type?: string | null
          consultant_fee?: number
          created_at?: string
          custom_duration?: string | null
          id?: string
          is_active?: boolean
          mobile?: string | null
          name?: string
          schedule_frequency?: string | null
          send_schedule_sms?: boolean | null
          send_schedule_whatsapp?: boolean | null
          specialization?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      document_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          requires_expiry: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          requires_expiry?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          requires_expiry?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      education_categories: {
        Row: {
          color: string | null
          created_at: string
          icon: string | null
          id: string
          name: string
          name_ta: string | null
          sort_order: number | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          name: string
          name_ta?: string | null
          sort_order?: number | null
        }
        Update: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
          name_ta?: string | null
          sort_order?: number | null
        }
        Relationships: []
      }
      education_subcategories: {
        Row: {
          category_id: string
          created_at: string
          id: string
          name: string
          name_ta: string | null
          sort_order: number | null
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          name: string
          name_ta?: string | null
          sort_order?: number | null
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          name?: string
          name_ta?: string | null
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "education_subcategories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "education_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      education_videos: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_custom: boolean | null
          sort_order: number | null
          subcategory_id: string
          thumbnail_url: string | null
          title: string
          treatment_keywords: string[] | null
          type: string
          youtube_url: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_custom?: boolean | null
          sort_order?: number | null
          subcategory_id: string
          thumbnail_url?: string | null
          title: string
          treatment_keywords?: string[] | null
          type?: string
          youtube_url?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_custom?: boolean | null
          sort_order?: number | null
          subcategory_id?: string
          thumbnail_url?: string | null
          title?: string
          treatment_keywords?: string[] | null
          type?: string
          youtube_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "education_videos_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "education_subcategories"
            referencedColumns: ["id"]
          },
        ]
      }
      emi_insurance_cases: {
        Row: {
          aadhar_number: string | null
          approved_amount: number | null
          approved_at: string | null
          approved_claim_amount: number | null
          case_code: string | null
          case_type: string
          claim_amount: number | null
          claim_status: string | null
          created_at: string
          created_by: string | null
          credit_score: number | null
          doctor: string | null
          documents_sent: Json | null
          down_payment: number | null
          eligible_amount: number | null
          emi_amount: number | null
          id: string
          insurance_company: string | null
          interest_rate: number | null
          lender_id: string | null
          lender_name: string | null
          notes: string | null
          pan_number: string | null
          patient_id: string
          policy_number: string | null
          status: string
          submitted_at: string | null
          tenure_months: number | null
          total_interest: number | null
          total_payable: number | null
          treatment_cost: number | null
          treatment_name: string | null
          updated_at: string
        }
        Insert: {
          aadhar_number?: string | null
          approved_amount?: number | null
          approved_at?: string | null
          approved_claim_amount?: number | null
          case_code?: string | null
          case_type?: string
          claim_amount?: number | null
          claim_status?: string | null
          created_at?: string
          created_by?: string | null
          credit_score?: number | null
          doctor?: string | null
          documents_sent?: Json | null
          down_payment?: number | null
          eligible_amount?: number | null
          emi_amount?: number | null
          id?: string
          insurance_company?: string | null
          interest_rate?: number | null
          lender_id?: string | null
          lender_name?: string | null
          notes?: string | null
          pan_number?: string | null
          patient_id: string
          policy_number?: string | null
          status?: string
          submitted_at?: string | null
          tenure_months?: number | null
          total_interest?: number | null
          total_payable?: number | null
          treatment_cost?: number | null
          treatment_name?: string | null
          updated_at?: string
        }
        Update: {
          aadhar_number?: string | null
          approved_amount?: number | null
          approved_at?: string | null
          approved_claim_amount?: number | null
          case_code?: string | null
          case_type?: string
          claim_amount?: number | null
          claim_status?: string | null
          created_at?: string
          created_by?: string | null
          credit_score?: number | null
          doctor?: string | null
          documents_sent?: Json | null
          down_payment?: number | null
          eligible_amount?: number | null
          emi_amount?: number | null
          id?: string
          insurance_company?: string | null
          interest_rate?: number | null
          lender_id?: string | null
          lender_name?: string | null
          notes?: string | null
          pan_number?: string | null
          patient_id?: string
          policy_number?: string | null
          status?: string
          submitted_at?: string | null
          tenure_months?: number | null
          total_interest?: number | null
          total_payable?: number | null
          treatment_cost?: number | null
          treatment_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "emi_insurance_cases_lender_id_fkey"
            columns: ["lender_id"]
            isOneToOne: false
            referencedRelation: "emi_lenders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emi_insurance_cases_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      emi_insurance_documents: {
        Row: {
          case_id: string
          doc_type: string
          file_name: string | null
          file_url: string
          id: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          case_id: string
          doc_type: string
          file_name?: string | null
          file_url: string
          id?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          case_id?: string
          doc_type?: string
          file_name?: string | null
          file_url?: string
          id?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "emi_insurance_documents_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "emi_insurance_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      emi_lenders: {
        Row: {
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          default_interest_rate: number | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          type: string
          updated_at: string
        }
        Insert: {
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          default_interest_rate?: number | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          type?: string
          updated_at?: string
        }
        Update: {
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          default_interest_rate?: number | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      employee_documents: {
        Row: {
          category_id: string
          created_at: string
          document_name: string
          employee_id: string
          expiry_date: string | null
          file_path: string | null
          file_size: number | null
          file_url: string
          id: string
          issue_date: string | null
          mime_type: string | null
          notes: string | null
          reminder_days: number
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          document_name: string
          employee_id: string
          expiry_date?: string | null
          file_path?: string | null
          file_size?: number | null
          file_url: string
          id?: string
          issue_date?: string | null
          mime_type?: string | null
          notes?: string | null
          reminder_days?: number
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          document_name?: string
          employee_id?: string
          expiry_date?: string | null
          file_path?: string | null
          file_size?: number | null
          file_url?: string
          id?: string
          issue_date?: string | null
          mime_type?: string | null
          notes?: string | null
          reminder_days?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_documents_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "document_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_shifts: {
        Row: {
          created_at: string
          effective_from: string
          effective_to: string | null
          employee_id: string
          end_time: string
          id: string
          notes: string | null
          shift_name: string
          start_time: string
          updated_at: string
          weekly_off_days: number[]
        }
        Insert: {
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          employee_id: string
          end_time?: string
          id?: string
          notes?: string | null
          shift_name?: string
          start_time?: string
          updated_at?: string
          weekly_off_days?: number[]
        }
        Update: {
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          employee_id?: string
          end_time?: string
          id?: string
          notes?: string | null
          shift_name?: string
          start_time?: string
          updated_at?: string
          weekly_off_days?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "employee_shifts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_target_achievement_logs: {
        Row: {
          achieved_date: string
          achieved_value: number
          created_at: string
          employee_id: string
          id: string
          metric_name: string
          target_id: string
          updated_at: string
        }
        Insert: {
          achieved_date: string
          achieved_value?: number
          created_at?: string
          employee_id: string
          id?: string
          metric_name: string
          target_id: string
          updated_at?: string
        }
        Update: {
          achieved_date?: string
          achieved_value?: number
          created_at?: string
          employee_id?: string
          id?: string
          metric_name?: string
          target_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_target_achievement_logs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_target_achievement_logs_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "employee_targets"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_targets: {
        Row: {
          achieved_value: number
          created_at: string
          department: string
          employee_id: string
          id: string
          manual_achieved: number | null
          manual_override: boolean
          metric_name: string
          notes: string | null
          period_end: string
          period_start: string
          points_per_unit: number
          role: string
          status: string
          target_type: string
          target_value: number
          unit: string
          updated_at: string
        }
        Insert: {
          achieved_value?: number
          created_at?: string
          department?: string
          employee_id: string
          id?: string
          manual_achieved?: number | null
          manual_override?: boolean
          metric_name: string
          notes?: string | null
          period_end?: string
          period_start?: string
          points_per_unit?: number
          role?: string
          status?: string
          target_type?: string
          target_value?: number
          unit?: string
          updated_at?: string
        }
        Update: {
          achieved_value?: number
          created_at?: string
          department?: string
          employee_id?: string
          id?: string
          manual_achieved?: number | null
          manual_override?: boolean
          metric_name?: string
          notes?: string | null
          period_end?: string
          period_start?: string
          points_per_unit?: number
          role?: string
          status?: string
          target_type?: string
          target_value?: number
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_targets_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_trainings: {
        Row: {
          certificate_expiry_date: string | null
          certificate_url: string | null
          completion_date: string | null
          created_at: string
          employee_id: string
          id: string
          notes: string | null
          program_id: string
          reminder_days: number
          score: number | null
          start_date: string | null
          status: string
          trainer_name: string | null
          updated_at: string
        }
        Insert: {
          certificate_expiry_date?: string | null
          certificate_url?: string | null
          completion_date?: string | null
          created_at?: string
          employee_id: string
          id?: string
          notes?: string | null
          program_id: string
          reminder_days?: number
          score?: number | null
          start_date?: string | null
          status?: string
          trainer_name?: string | null
          updated_at?: string
        }
        Update: {
          certificate_expiry_date?: string | null
          certificate_url?: string | null
          completion_date?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          notes?: string | null
          program_id?: string
          reminder_days?: number
          score?: number | null
          start_date?: string | null
          status?: string
          trainer_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_trainings_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_trainings_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "training_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          aadhar_number: string | null
          address: string | null
          bank_account_number: string | null
          bank_ifsc: string | null
          bank_name: string | null
          base_salary: number | null
          created_at: string
          date_of_birth: string | null
          department: string | null
          designation: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          employee_code: string | null
          employment_type: string | null
          exit_date: string | null
          extra_details: Json
          first_name: string
          gender: string | null
          id: string
          join_date: string
          last_name: string
          pan_number: string | null
          phone: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          aadhar_number?: string | null
          address?: string | null
          bank_account_number?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          base_salary?: number | null
          created_at?: string
          date_of_birth?: string | null
          department?: string | null
          designation?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          employee_code?: string | null
          employment_type?: string | null
          exit_date?: string | null
          extra_details?: Json
          first_name: string
          gender?: string | null
          id?: string
          join_date?: string
          last_name: string
          pan_number?: string | null
          phone?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          aadhar_number?: string | null
          address?: string | null
          bank_account_number?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          base_salary?: number | null
          created_at?: string
          date_of_birth?: string | null
          department?: string | null
          designation?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          employee_code?: string | null
          employment_type?: string | null
          exit_date?: string | null
          extra_details?: Json
          first_name?: string
          gender?: string | null
          id?: string
          join_date?: string
          last_name?: string
          pan_number?: string | null
          phone?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      expense_categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          value: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          value?: string
        }
        Relationships: []
      }
      expense_requests: {
        Row: {
          admin_comment: string | null
          amount: number
          category: string
          created_at: string
          description: string | null
          employee_id: string
          expense_date: string
          id: string
          receipt_url: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          admin_comment?: string | null
          amount: number
          category: string
          created_at?: string
          description?: string | null
          employee_id: string
          expense_date?: string
          id?: string
          receipt_url?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          admin_comment?: string | null
          amount?: number
          category?: string
          created_at?: string
          description?: string | null
          employee_id?: string
          expense_date?: string
          id?: string
          receipt_url?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_subcategories: {
        Row: {
          category_value: string
          created_at: string
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          value: string
        }
        Insert: {
          category_value: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          value: string
        }
        Update: {
          category_value?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          value?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          description: string
          expense_date: string
          expense_number: string | null
          id: string
          notes: string | null
          paid_to: string | null
          payment_method: string | null
          purchase_id: string | null
          receipt_number: string | null
          receipt_url: string | null
          subcategory: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          category?: string
          created_at?: string
          description: string
          expense_date?: string
          expense_number?: string | null
          id?: string
          notes?: string | null
          paid_to?: string | null
          payment_method?: string | null
          purchase_id?: string | null
          receipt_number?: string | null
          receipt_url?: string | null
          subcategory?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          description?: string
          expense_date?: string
          expense_number?: string | null
          id?: string
          notes?: string | null
          paid_to?: string | null
          payment_method?: string | null
          purchase_id?: string | null
          receipt_number?: string | null
          receipt_url?: string | null
          subcategory?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      finding_status_history: {
        Row: {
          appointment_id: string | null
          checkin_id: string | null
          created_at: string
          doctor: string | null
          event_date: string
          finding_id: string
          id: string
          new_status: string
          patient_id: string
          previous_status: string | null
          progress_note: string | null
          updated_by: string | null
        }
        Insert: {
          appointment_id?: string | null
          checkin_id?: string | null
          created_at?: string
          doctor?: string | null
          event_date?: string
          finding_id: string
          id?: string
          new_status: string
          patient_id: string
          previous_status?: string | null
          progress_note?: string | null
          updated_by?: string | null
        }
        Update: {
          appointment_id?: string | null
          checkin_id?: string | null
          created_at?: string
          doctor?: string | null
          event_date?: string
          finding_id?: string
          id?: string
          new_status?: string
          patient_id?: string
          previous_status?: string | null
          progress_note?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finding_status_history_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finding_status_history_checkin_id_fkey"
            columns: ["checkin_id"]
            isOneToOne: false
            referencedRelation: "patient_checkins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finding_status_history_finding_id_fkey"
            columns: ["finding_id"]
            isOneToOne: false
            referencedRelation: "consultation_findings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finding_status_history_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_ups: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          created_by_id: string | null
          due_date: string
          id: string
          lead_id: string
          note: string | null
          status: string
          updated_at: string
          updated_by: string | null
          updated_by_name: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          created_by_id?: string | null
          due_date: string
          id?: string
          lead_id: string
          note?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          updated_by_name?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          created_by_id?: string | null
          due_date?: string
          id?: string
          lead_id?: string
          note?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          updated_by_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "follow_ups_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      form_16: {
        Row: {
          created_at: string
          employee_id: string
          financial_year: string
          generated_at: string | null
          id: string
          notes: string | null
          pdf_url: string | null
          published_at: string | null
          signed_at: string | null
          status: string | null
          total_income: number | null
          total_tax: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          financial_year: string
          generated_at?: string | null
          id?: string
          notes?: string | null
          pdf_url?: string | null
          published_at?: string | null
          signed_at?: string | null
          status?: string | null
          total_income?: number | null
          total_tax?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          financial_year?: string
          generated_at?: string | null
          id?: string
          notes?: string | null
          pdf_url?: string | null
          published_at?: string | null
          signed_at?: string | null
          status?: string | null
          total_income?: number | null
          total_tax?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      fy_actual_tracking: {
        Row: {
          actual_cosmetic_cases: number
          actual_expense: number
          actual_implants: number
          actual_marketing_spend: number
          actual_ortho_cases: number
          actual_patients: number
          actual_profit: number
          actual_recall_patients: number
          actual_revenue: number
          actual_salary_spend: number
          branch_id: string | null
          created_at: string
          date: string
          financial_year: string
          id: string
          is_manual_override: boolean
          month: number
          updated_at: string
        }
        Insert: {
          actual_cosmetic_cases?: number
          actual_expense?: number
          actual_implants?: number
          actual_marketing_spend?: number
          actual_ortho_cases?: number
          actual_patients?: number
          actual_profit?: number
          actual_recall_patients?: number
          actual_revenue?: number
          actual_salary_spend?: number
          branch_id?: string | null
          created_at?: string
          date?: string
          financial_year: string
          id?: string
          is_manual_override?: boolean
          month: number
          updated_at?: string
        }
        Update: {
          actual_cosmetic_cases?: number
          actual_expense?: number
          actual_implants?: number
          actual_marketing_spend?: number
          actual_ortho_cases?: number
          actual_patients?: number
          actual_profit?: number
          actual_recall_patients?: number
          actual_revenue?: number
          actual_salary_spend?: number
          branch_id?: string | null
          created_at?: string
          date?: string
          financial_year?: string
          id?: string
          is_manual_override?: boolean
          month?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fy_actual_tracking_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      fy_ad_targets: {
        Row: {
          branch_id: string | null
          budget: number
          campaign: string | null
          cpl_target: number
          created_at: string
          financial_year: string
          id: string
          lead_target: number
          month: number
          notes: string | null
          platform: string
          roas_target: number
          treatment: string | null
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          budget?: number
          campaign?: string | null
          cpl_target?: number
          created_at?: string
          financial_year: string
          id?: string
          lead_target?: number
          month: number
          notes?: string | null
          platform: string
          roas_target?: number
          treatment?: string | null
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          budget?: number
          campaign?: string | null
          cpl_target?: number
          created_at?: string
          financial_year?: string
          id?: string
          lead_target?: number
          month?: number
          notes?: string | null
          platform?: string
          roas_target?: number
          treatment?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fy_ad_targets_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      fy_digital_marketing_roi_targets: {
        Row: {
          ad_spend_target: number
          branch_id: string | null
          created_at: string
          financial_year: string
          id: string
          leads_target: number
          month: number
          notes: string | null
          platform: string
          revenue_target: number
          roas_target: number
          updated_at: string
        }
        Insert: {
          ad_spend_target?: number
          branch_id?: string | null
          created_at?: string
          financial_year: string
          id?: string
          leads_target?: number
          month: number
          notes?: string | null
          platform: string
          revenue_target?: number
          roas_target?: number
          updated_at?: string
        }
        Update: {
          ad_spend_target?: number
          branch_id?: string | null
          created_at?: string
          financial_year?: string
          id?: string
          leads_target?: number
          month?: number
          notes?: string | null
          platform?: string
          revenue_target?: number
          roas_target?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fy_digital_marketing_roi_targets_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      fy_doctor_targets: {
        Row: {
          branch_id: string | null
          case_target: number
          created_at: string
          doctor_name: string
          financial_year: string
          id: string
          month: number
          notes: string | null
          patient_target: number
          revenue_target: number
          treatment_type: string | null
          updated_at: string
          utilization_target: number
        }
        Insert: {
          branch_id?: string | null
          case_target?: number
          created_at?: string
          doctor_name: string
          financial_year: string
          id?: string
          month: number
          notes?: string | null
          patient_target?: number
          revenue_target?: number
          treatment_type?: string | null
          updated_at?: string
          utilization_target?: number
        }
        Update: {
          branch_id?: string | null
          case_target?: number
          created_at?: string
          doctor_name?: string
          financial_year?: string
          id?: string
          month?: number
          notes?: string | null
          patient_target?: number
          revenue_target?: number
          treatment_type?: string | null
          updated_at?: string
          utilization_target?: number
        }
        Relationships: [
          {
            foreignKeyName: "fy_doctor_targets_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      fy_finance_targets: {
        Row: {
          branch_id: string | null
          cogs_target: number
          created_at: string
          financial_year: string
          gross_margin_percent: number
          gross_profit_target: number
          id: string
          month: number
          net_margin_percent: number
          net_profit_target: number
          notes: string | null
          operating_expense_target: number
          topline_revenue_target: number
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          cogs_target?: number
          created_at?: string
          financial_year: string
          gross_margin_percent?: number
          gross_profit_target?: number
          id?: string
          month: number
          net_margin_percent?: number
          net_profit_target?: number
          notes?: string | null
          operating_expense_target?: number
          topline_revenue_target?: number
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          cogs_target?: number
          created_at?: string
          financial_year?: string
          gross_margin_percent?: number
          gross_profit_target?: number
          id?: string
          month?: number
          net_margin_percent?: number
          net_profit_target?: number
          notes?: string | null
          operating_expense_target?: number
          topline_revenue_target?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fy_finance_targets_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      fy_master_plan: {
        Row: {
          branch_id: string | null
          case_acceptance_target: number
          chair_utilization_target: number
          cosmetic_revenue_target: number
          created_at: string
          created_by: string | null
          financial_year: string
          general_dentistry_target: number
          id: string
          implant_revenue_target: number
          new_patient_target: number
          notes: string | null
          op_revenue_target: number
          ortho_revenue_target: number
          recall_patient_target: number
          total_patient_target: number
          total_revenue_target: number
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          case_acceptance_target?: number
          chair_utilization_target?: number
          cosmetic_revenue_target?: number
          created_at?: string
          created_by?: string | null
          financial_year: string
          general_dentistry_target?: number
          id?: string
          implant_revenue_target?: number
          new_patient_target?: number
          notes?: string | null
          op_revenue_target?: number
          ortho_revenue_target?: number
          recall_patient_target?: number
          total_patient_target?: number
          total_revenue_target?: number
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          case_acceptance_target?: number
          chair_utilization_target?: number
          cosmetic_revenue_target?: number
          created_at?: string
          created_by?: string | null
          financial_year?: string
          general_dentistry_target?: number
          id?: string
          implant_revenue_target?: number
          new_patient_target?: number
          notes?: string | null
          op_revenue_target?: number
          ortho_revenue_target?: number
          recall_patient_target?: number
          total_patient_target?: number
          total_revenue_target?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fy_master_plan_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      fy_monthly_targets: {
        Row: {
          branch_id: string | null
          cosmetic_target: number
          created_at: string
          financial_year: string
          id: string
          implant_target: number
          marketing_budget: number
          month: number
          net_profit_target: number
          operational_cost_budget: number
          ortho_target: number
          patient_target: number
          recall_target: number
          revenue_target: number
          salary_budget: number
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          cosmetic_target?: number
          created_at?: string
          financial_year: string
          id?: string
          implant_target?: number
          marketing_budget?: number
          month: number
          net_profit_target?: number
          operational_cost_budget?: number
          ortho_target?: number
          patient_target?: number
          recall_target?: number
          revenue_target?: number
          salary_budget?: number
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          cosmetic_target?: number
          created_at?: string
          financial_year?: string
          id?: string
          implant_target?: number
          marketing_budget?: number
          month?: number
          net_profit_target?: number
          operational_cost_budget?: number
          ortho_target?: number
          patient_target?: number
          recall_target?: number
          revenue_target?: number
          salary_budget?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fy_monthly_targets_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      fy_offline_camp_roi_targets: {
        Row: {
          branch_id: string | null
          camp_type: string
          conversions_target: number
          created_at: string
          financial_year: string
          id: string
          month: number
          notes: string | null
          participants_target: number
          revenue_target: number
          roi_target: number
          spend_target: number
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          camp_type: string
          conversions_target?: number
          created_at?: string
          financial_year: string
          id?: string
          month: number
          notes?: string | null
          participants_target?: number
          revenue_target?: number
          roi_target?: number
          spend_target?: number
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          camp_type?: string
          conversions_target?: number
          created_at?: string
          financial_year?: string
          id?: string
          month?: number
          notes?: string | null
          participants_target?: number
          revenue_target?: number
          roi_target?: number
          spend_target?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fy_offline_camp_roi_targets_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      fy_offline_camp_targets: {
        Row: {
          branch_id: string | null
          budget: number
          camp_type: string
          camps_planned: number
          created_at: string
          expected_conversions: number
          expected_revenue: number
          expected_screenings: number
          financial_year: string
          id: string
          month: number
          notes: string | null
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          budget?: number
          camp_type?: string
          camps_planned?: number
          created_at?: string
          expected_conversions?: number
          expected_revenue?: number
          expected_screenings?: number
          financial_year: string
          id?: string
          month: number
          notes?: string | null
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          budget?: number
          camp_type?: string
          camps_planned?: number
          created_at?: string
          expected_conversions?: number
          expected_revenue?: number
          expected_screenings?: number
          financial_year?: string
          id?: string
          month?: number
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fy_offline_camp_targets_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      fy_patient_targets: {
        Row: {
          ad_patient_target: number
          branch_id: string | null
          created_at: string
          daily_avg_target: number
          financial_year: string
          id: string
          month: number
          new_patient_target: number
          notes: string | null
          offline_camp_patient_target: number
          recall_patient_target: number
          referral_target: number
          social_media_patient_target: number
          total_patient_target: number
          updated_at: string
          walk_in_target: number
        }
        Insert: {
          ad_patient_target?: number
          branch_id?: string | null
          created_at?: string
          daily_avg_target?: number
          financial_year: string
          id?: string
          month: number
          new_patient_target?: number
          notes?: string | null
          offline_camp_patient_target?: number
          recall_patient_target?: number
          referral_target?: number
          social_media_patient_target?: number
          total_patient_target?: number
          updated_at?: string
          walk_in_target?: number
        }
        Update: {
          ad_patient_target?: number
          branch_id?: string | null
          created_at?: string
          daily_avg_target?: number
          financial_year?: string
          id?: string
          month?: number
          new_patient_target?: number
          notes?: string | null
          offline_camp_patient_target?: number
          recall_patient_target?: number
          referral_target?: number
          social_media_patient_target?: number
          total_patient_target?: number
          updated_at?: string
          walk_in_target?: number
        }
        Relationships: [
          {
            foreignKeyName: "fy_patient_targets_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      fy_pre_targets: {
        Row: {
          appointments_booked_target: number
          branch_id: string | null
          clinic_converted_target: number
          created_at: string
          financial_year: string
          followup_calls_target: number
          id: string
          month: number
          new_calls_target: number
          notes: string | null
          old_followup_calls_target: number
          old_leads_target: number
          pre_name: string | null
          responsible_person: string | null
          total_calls_target: number
          treatment_taken_target: number
          updated_at: string
        }
        Insert: {
          appointments_booked_target?: number
          branch_id?: string | null
          clinic_converted_target?: number
          created_at?: string
          financial_year: string
          followup_calls_target?: number
          id?: string
          month: number
          new_calls_target?: number
          notes?: string | null
          old_followup_calls_target?: number
          old_leads_target?: number
          pre_name?: string | null
          responsible_person?: string | null
          total_calls_target?: number
          treatment_taken_target?: number
          updated_at?: string
        }
        Update: {
          appointments_booked_target?: number
          branch_id?: string | null
          clinic_converted_target?: number
          created_at?: string
          financial_year?: string
          followup_calls_target?: number
          id?: string
          month?: number
          new_calls_target?: number
          notes?: string | null
          old_followup_calls_target?: number
          old_leads_target?: number
          pre_name?: string | null
          responsible_person?: string | null
          total_calls_target?: number
          treatment_taken_target?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fy_pre_targets_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      fy_recruitment_targets: {
        Row: {
          branch_id: string | null
          budget_per_position: number
          created_at: string
          department: string | null
          expected_joining_month: number | null
          financial_year: string
          id: string
          month: number
          notes: string | null
          positions_target: number
          role_name: string
          status: string
          total_budget: number
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          budget_per_position?: number
          created_at?: string
          department?: string | null
          expected_joining_month?: number | null
          financial_year: string
          id?: string
          month: number
          notes?: string | null
          positions_target?: number
          role_name: string
          status?: string
          total_budget?: number
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          budget_per_position?: number
          created_at?: string
          department?: string | null
          expected_joining_month?: number | null
          financial_year?: string
          id?: string
          month?: number
          notes?: string | null
          positions_target?: number
          role_name?: string
          status?: string
          total_budget?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fy_recruitment_targets_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      fy_sales_targets: {
        Row: {
          branch_id: string | null
          campaign: string | null
          closed_revenue_target: number
          closures_target: number
          conversion_rate_target: number
          converted_target: number
          created_at: string
          financial_year: string
          id: string
          month: number
          notes: string | null
          opportunity_value_target: number
          qualified_lead_target: number
          responsible_person: string | null
          source: string | null
          total_lead_target: number
          treatment: string | null
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          campaign?: string | null
          closed_revenue_target?: number
          closures_target?: number
          conversion_rate_target?: number
          converted_target?: number
          created_at?: string
          financial_year: string
          id?: string
          month: number
          notes?: string | null
          opportunity_value_target?: number
          qualified_lead_target?: number
          responsible_person?: string | null
          source?: string | null
          total_lead_target?: number
          treatment?: string | null
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          campaign?: string | null
          closed_revenue_target?: number
          closures_target?: number
          conversion_rate_target?: number
          converted_target?: number
          created_at?: string
          financial_year?: string
          id?: string
          month?: number
          notes?: string | null
          opportunity_value_target?: number
          qualified_lead_target?: number
          responsible_person?: string | null
          source?: string | null
          total_lead_target?: number
          treatment?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fy_sales_targets_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      fy_social_media_targets: {
        Row: {
          branch_id: string | null
          created_at: string
          engagement_target: number
          financial_year: string
          follower_growth_target: number
          id: string
          lead_target: number
          month: number
          notes: string | null
          platform: string
          posts_target: number
          reach_target: number
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          engagement_target?: number
          financial_year: string
          follower_growth_target?: number
          id?: string
          lead_target?: number
          month: number
          notes?: string | null
          platform: string
          posts_target?: number
          reach_target?: number
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          engagement_target?: number
          financial_year?: string
          follower_growth_target?: number
          id?: string
          lead_target?: number
          month?: number
          notes?: string | null
          platform?: string
          posts_target?: number
          reach_target?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fy_social_media_targets_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      fy_treatment_revenue_targets: {
        Row: {
          avg_case_value: number
          branch_id: string | null
          case_count_target: number
          created_at: string
          financial_year: string
          id: string
          month: number
          notes: string | null
          revenue_target: number
          treatment: string
          updated_at: string
        }
        Insert: {
          avg_case_value?: number
          branch_id?: string | null
          case_count_target?: number
          created_at?: string
          financial_year: string
          id?: string
          month: number
          notes?: string | null
          revenue_target?: number
          treatment: string
          updated_at?: string
        }
        Update: {
          avg_case_value?: number
          branch_id?: string | null
          case_count_target?: number
          created_at?: string
          financial_year?: string
          id?: string
          month?: number
          notes?: string | null
          revenue_target?: number
          treatment?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fy_treatment_revenue_targets_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      fy_treatment_targets: {
        Row: {
          avg_case_value: number
          branch_id: string | null
          case_count_target: number
          conversion_target: number
          created_at: string
          financial_year: string
          id: string
          month: number
          notes: string | null
          revenue_target: number
          treatment_name: string
          updated_at: string
        }
        Insert: {
          avg_case_value?: number
          branch_id?: string | null
          case_count_target?: number
          conversion_target?: number
          created_at?: string
          financial_year: string
          id?: string
          month: number
          notes?: string | null
          revenue_target?: number
          treatment_name: string
          updated_at?: string
        }
        Update: {
          avg_case_value?: number
          branch_id?: string | null
          case_count_target?: number
          conversion_target?: number
          created_at?: string
          financial_year?: string
          id?: string
          month?: number
          notes?: string | null
          revenue_target?: number
          treatment_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fy_treatment_targets_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      fy_variance_tracker: {
        Row: {
          branch_id: string | null
          computed_at: string
          financial_year: string
          id: string
          month: number
          patient_actual: number
          patient_target: number
          patient_variance: number
          profit_actual: number
          profit_target: number
          profit_variance: number
          revenue_actual: number
          revenue_target: number
          revenue_variance: number
          variance_status: string
        }
        Insert: {
          branch_id?: string | null
          computed_at?: string
          financial_year: string
          id?: string
          month: number
          patient_actual?: number
          patient_target?: number
          patient_variance?: number
          profit_actual?: number
          profit_target?: number
          profit_variance?: number
          revenue_actual?: number
          revenue_target?: number
          revenue_variance?: number
          variance_status?: string
        }
        Update: {
          branch_id?: string | null
          computed_at?: string
          financial_year?: string
          id?: string
          month?: number
          patient_actual?: number
          patient_target?: number
          patient_variance?: number
          profit_actual?: number
          profit_target?: number
          profit_variance?: number
          revenue_actual?: number
          revenue_target?: number
          revenue_variance?: number
          variance_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "fy_variance_tracker_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      geofence_zones: {
        Row: {
          applicable_departments: string[] | null
          applicable_employees: string[] | null
          applicable_locations: string[] | null
          applicable_marital_status: string[] | null
          created_at: string
          excluded_employees: string[] | null
          id: string
          is_active: boolean
          latitude: number
          longitude: number
          name: string
          place_address: string | null
          radius_meters: number
          updated_at: string
        }
        Insert: {
          applicable_departments?: string[] | null
          applicable_employees?: string[] | null
          applicable_locations?: string[] | null
          applicable_marital_status?: string[] | null
          created_at?: string
          excluded_employees?: string[] | null
          id?: string
          is_active?: boolean
          latitude: number
          longitude: number
          name: string
          place_address?: string | null
          radius_meters?: number
          updated_at?: string
        }
        Update: {
          applicable_departments?: string[] | null
          applicable_employees?: string[] | null
          applicable_locations?: string[] | null
          applicable_marital_status?: string[] | null
          created_at?: string
          excluded_employees?: string[] | null
          id?: string
          is_active?: boolean
          latitude?: number
          longitude?: number
          name?: string
          place_address?: string | null
          radius_meters?: number
          updated_at?: string
        }
        Relationships: []
      }
      holidays: {
        Row: {
          created_at: string
          description: string | null
          duration: string
          holiday_date: string
          id: string
          location: string | null
          name: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          duration?: string
          holiday_date: string
          id?: string
          location?: string | null
          name: string
          type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          duration?: string
          holiday_date?: string
          id?: string
          location?: string | null
          name?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      housekeeping_quality_logs: {
        Row: {
          action_taken: string | null
          area: string
          created_at: string
          id: string
          issue_description: string
          issue_type: string
          notes: string | null
          reported_by: string
          reported_date: string
          resolved_date: string | null
          severity: string
          status: string
        }
        Insert: {
          action_taken?: string | null
          area: string
          created_at?: string
          id?: string
          issue_description: string
          issue_type?: string
          notes?: string | null
          reported_by: string
          reported_date?: string
          resolved_date?: string | null
          severity?: string
          status?: string
        }
        Update: {
          action_taken?: string | null
          area?: string
          created_at?: string
          id?: string
          issue_description?: string
          issue_type?: string
          notes?: string | null
          reported_by?: string
          reported_date?: string
          resolved_date?: string | null
          severity?: string
          status?: string
        }
        Relationships: []
      }
      incentive_plans: {
        Row: {
          created_at: string
          department: string
          employee_id: string
          id: string
          incentive_amount: number
          incentive_type: string
          is_active: boolean
          metric_name: string
          period: string
          plan_name: string
          threshold_value: number
        }
        Insert: {
          created_at?: string
          department?: string
          employee_id: string
          id?: string
          incentive_amount?: number
          incentive_type?: string
          is_active?: boolean
          metric_name: string
          period?: string
          plan_name: string
          threshold_value?: number
        }
        Update: {
          created_at?: string
          department?: string
          employee_id?: string
          id?: string
          incentive_amount?: number
          incentive_type?: string
          is_active?: boolean
          metric_name?: string
          period?: string
          plan_name?: string
          threshold_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "incentive_plans_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      institution_interactions: {
        Row: {
          attachments: Json | null
          contact_person: string | null
          created_at: string
          duration_minutes: number | null
          id: string
          institution_id: string
          interaction_date: string
          interaction_type: string
          logged_by: string | null
          next_action: string | null
          next_action_date: string | null
          outcome: string | null
          summary: string
          updated_at: string
        }
        Insert: {
          attachments?: Json | null
          contact_person?: string | null
          created_at?: string
          duration_minutes?: number | null
          id?: string
          institution_id: string
          interaction_date?: string
          interaction_type?: string
          logged_by?: string | null
          next_action?: string | null
          next_action_date?: string | null
          outcome?: string | null
          summary: string
          updated_at?: string
        }
        Update: {
          attachments?: Json | null
          contact_person?: string | null
          created_at?: string
          duration_minutes?: number | null
          id?: string
          institution_id?: string
          interaction_date?: string
          interaction_type?: string
          logged_by?: string | null
          next_action?: string | null
          next_action_date?: string | null
          outcome?: string | null
          summary?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "institution_interactions_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
        ]
      }
      institutions: {
        Row: {
          address: string | null
          area: string | null
          assigned_coordinator: string | null
          category: string
          contact_person_name: string | null
          contact_person_role: string | null
          created_at: string
          decision_maker_level: string | null
          email: string | null
          id: string
          last_visit_date: string | null
          name: string
          next_followup_date: string | null
          notes: string | null
          phone: string | null
          status: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          area?: string | null
          assigned_coordinator?: string | null
          category?: string
          contact_person_name?: string | null
          contact_person_role?: string | null
          created_at?: string
          decision_maker_level?: string | null
          email?: string | null
          id?: string
          last_visit_date?: string | null
          name: string
          next_followup_date?: string | null
          notes?: string | null
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          area?: string | null
          assigned_coordinator?: string | null
          category?: string
          contact_person_name?: string | null
          contact_person_role?: string | null
          created_at?: string
          decision_maker_level?: string | null
          email?: string | null
          id?: string
          last_visit_date?: string | null
          name?: string
          next_followup_date?: string | null
          notes?: string | null
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      inventory_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      inventory_items: {
        Row: {
          batch_number: string | null
          brand: string | null
          category_id: string | null
          cost_price: number | null
          created_at: string
          expiry_date: string | null
          id: string
          is_active: boolean
          is_favorite: boolean
          min_stock_level: number
          name: string
          notes: string | null
          quantity: number
          selling_price: number | null
          sku: string | null
          status: string
          supplier: string | null
          unit: string
          updated_at: string
        }
        Insert: {
          batch_number?: string | null
          brand?: string | null
          category_id?: string | null
          cost_price?: number | null
          created_at?: string
          expiry_date?: string | null
          id?: string
          is_active?: boolean
          is_favorite?: boolean
          min_stock_level?: number
          name: string
          notes?: string | null
          quantity?: number
          selling_price?: number | null
          sku?: string | null
          status?: string
          supplier?: string | null
          unit?: string
          updated_at?: string
        }
        Update: {
          batch_number?: string | null
          brand?: string | null
          category_id?: string | null
          cost_price?: number | null
          created_at?: string
          expiry_date?: string | null
          id?: string
          is_active?: boolean
          is_favorite?: boolean
          min_stock_level?: number
          name?: string
          notes?: string | null
          quantity?: number
          selling_price?: number | null
          sku?: string | null
          status?: string
          supplier?: string | null
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "inventory_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_transactions: {
        Row: {
          created_at: string
          id: string
          item_id: string
          notes: string | null
          quantity: number
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          notes?: string | null
          quantity: number
          type: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          notes?: string | null
          quantity?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transactions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      jd_departments: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      jd_roles: {
        Row: {
          created_at: string
          department_id: string
          id: string
          is_active: boolean
          job_description: string | null
          kpis: Json
          requirements: string | null
          responsibilities: string | null
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          department_id: string
          id?: string
          is_active?: boolean
          job_description?: string | null
          kpis?: Json
          requirements?: string | null
          responsibilities?: string | null
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          department_id?: string
          id?: string
          is_active?: boolean
          job_description?: string | null
          kpis?: Json
          requirements?: string | null
          responsibilities?: string | null
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jd_roles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "jd_departments"
            referencedColumns: ["id"]
          },
        ]
      }
      job_openings: {
        Row: {
          closing_date: string | null
          created_at: string
          created_by: string | null
          department: string
          description: string | null
          designation: string | null
          experience_max: number | null
          experience_min: number | null
          filled_count: number
          hiring_source: string
          id: string
          job_type: string
          location: string | null
          openings_count: number
          posted_date: string | null
          requirements: string | null
          salary_max: number | null
          salary_min: number | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          closing_date?: string | null
          created_at?: string
          created_by?: string | null
          department?: string
          description?: string | null
          designation?: string | null
          experience_max?: number | null
          experience_min?: number | null
          filled_count?: number
          hiring_source?: string
          id?: string
          job_type?: string
          location?: string | null
          openings_count?: number
          posted_date?: string | null
          requirements?: string | null
          salary_max?: number | null
          salary_min?: number | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          closing_date?: string | null
          created_at?: string
          created_by?: string | null
          department?: string
          description?: string | null
          designation?: string | null
          experience_max?: number | null
          experience_min?: number | null
          filled_count?: number
          hiring_source?: string
          id?: string
          job_type?: string
          location?: string | null
          openings_count?: number
          posted_date?: string | null
          requirements?: string | null
          salary_max?: number | null
          salary_min?: number | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      job_state: {
        Row: {
          job: string
          last_error: string | null
          last_result: Json | null
          last_run_at: string | null
          lease_until: string | null
          paused: boolean
          paused_reason: string | null
          updated_at: string
        }
        Insert: {
          job: string
          last_error?: string | null
          last_result?: Json | null
          last_run_at?: string | null
          lease_until?: string | null
          paused?: boolean
          paused_reason?: string | null
          updated_at?: string
        }
        Update: {
          job?: string
          last_error?: string | null
          last_result?: Json | null
          last_run_at?: string | null
          lease_until?: string | null
          paused?: boolean
          paused_reason?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      lab_order_backfill_dismissals: {
        Row: {
          billing_id: string
          dismissed_at: string
          dismissed_by: string | null
          id: string
          patient_id: string
        }
        Insert: {
          billing_id: string
          dismissed_at?: string
          dismissed_by?: string | null
          id?: string
          patient_id: string
        }
        Update: {
          billing_id?: string
          dismissed_at?: string
          dismissed_by?: string | null
          id?: string
          patient_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lab_order_backfill_dismissals_billing_id_fkey"
            columns: ["billing_id"]
            isOneToOne: false
            referencedRelation: "billings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_order_backfill_dismissals_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_orders: {
        Row: {
          actual_delivery_date: string | null
          billing_id: string | null
          checkin_id: string | null
          created_at: string
          description: string | null
          doctor: string | null
          expected_delivery_date: string | null
          id: string
          lab_expense: number
          lab_expense_paid_amount: number
          lab_expense_paid_date: string | null
          lab_name: string
          lab_payment_status: string
          lab_phone: string | null
          material: string | null
          notes: string | null
          patient_bill: number
          patient_id: string
          price_of_material: number
          rate: number | null
          sent_date: string | null
          shade: string | null
          status: string
          tooth_number: string | null
          updated_at: string
          warranty_card_url: string | null
          warranty_years: number | null
          work_type: string
        }
        Insert: {
          actual_delivery_date?: string | null
          billing_id?: string | null
          checkin_id?: string | null
          created_at?: string
          description?: string | null
          doctor?: string | null
          expected_delivery_date?: string | null
          id?: string
          lab_expense?: number
          lab_expense_paid_amount?: number
          lab_expense_paid_date?: string | null
          lab_name: string
          lab_payment_status?: string
          lab_phone?: string | null
          material?: string | null
          notes?: string | null
          patient_bill?: number
          patient_id: string
          price_of_material?: number
          rate?: number | null
          sent_date?: string | null
          shade?: string | null
          status?: string
          tooth_number?: string | null
          updated_at?: string
          warranty_card_url?: string | null
          warranty_years?: number | null
          work_type?: string
        }
        Update: {
          actual_delivery_date?: string | null
          billing_id?: string | null
          checkin_id?: string | null
          created_at?: string
          description?: string | null
          doctor?: string | null
          expected_delivery_date?: string | null
          id?: string
          lab_expense?: number
          lab_expense_paid_amount?: number
          lab_expense_paid_date?: string | null
          lab_name?: string
          lab_payment_status?: string
          lab_phone?: string | null
          material?: string | null
          notes?: string | null
          patient_bill?: number
          patient_id?: string
          price_of_material?: number
          rate?: number | null
          sent_date?: string | null
          shade?: string | null
          status?: string
          tooth_number?: string | null
          updated_at?: string
          warranty_card_url?: string | null
          warranty_years?: number | null
          work_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "lab_orders_billing_id_fkey"
            columns: ["billing_id"]
            isOneToOne: false
            referencedRelation: "billings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_orders_checkin_id_fkey"
            columns: ["checkin_id"]
            isOneToOne: false
            referencedRelation: "patient_checkins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_orders_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_quality_logs: {
        Row: {
          action_taken: string | null
          created_at: string
          id: string
          is_repeat: boolean
          issue_description: string
          issue_type: string
          lab_name: string
          lab_order_id: string | null
          material: string | null
          notes: string | null
          patient_name: string
          repeat_count: number | null
          reported_date: string
          resolved_date: string | null
          severity: string
          status: string
          work_type: string
        }
        Insert: {
          action_taken?: string | null
          created_at?: string
          id?: string
          is_repeat?: boolean
          issue_description: string
          issue_type?: string
          lab_name: string
          lab_order_id?: string | null
          material?: string | null
          notes?: string | null
          patient_name: string
          repeat_count?: number | null
          reported_date?: string
          resolved_date?: string | null
          severity?: string
          status?: string
          work_type?: string
        }
        Update: {
          action_taken?: string | null
          created_at?: string
          id?: string
          is_repeat?: boolean
          issue_description?: string
          issue_type?: string
          lab_name?: string
          lab_order_id?: string | null
          material?: string | null
          notes?: string | null
          patient_name?: string
          repeat_count?: number | null
          reported_date?: string
          resolved_date?: string | null
          severity?: string
          status?: string
          work_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "lab_quality_logs_lab_order_id_fkey"
            columns: ["lab_order_id"]
            isOneToOne: false
            referencedRelation: "lab_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_works: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          lab_name: string | null
          materials: string[] | null
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          lab_name?: string | null
          materials?: string[] | null
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          lab_name?: string | null
          materials?: string[] | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      labs: {
        Row: {
          contact_person: string | null
          created_at: string
          id: string
          is_active: boolean
          mobile: string | null
          name: string
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          contact_person?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          mobile?: string | null
          name: string
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          contact_person?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          mobile?: string | null
          name?: string
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      lead_activity: {
        Row: {
          action: string
          created_at: string
          description: string
          field: string | null
          id: string
          lead_id: string
          new_value: string | null
          old_value: string | null
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          action: string
          created_at?: string
          description: string
          field?: string | null
          id?: string
          lead_id: string
          new_value?: string | null
          old_value?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          description?: string
          field?: string | null
          id?: string
          lead_id?: string
          new_value?: string | null
          old_value?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_activity_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_notes: {
        Row: {
          created_at: string
          created_by: string | null
          created_by_name: string | null
          id: string
          lead_id: string
          note: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          id?: string
          lead_id: string
          note: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          id?: string
          lead_id?: string
          note?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_notes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_sources: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          age: number | null
          ai_priority: string | null
          assigned_to: string | null
          assigned_to_id: string | null
          assigned_to_name: string | null
          city: string | null
          created_at: string
          created_by: string | null
          dental_problem: string | null
          email: string | null
          estimated_value: number | null
          follow_up_date: string | null
          id: string
          lead_score: number
          meta_form_id: string | null
          meta_form_name: string | null
          meta_lead_id: string | null
          name: string
          notes: string | null
          phone: string
          source: string
          status: string
          treatment_interest: string
          updated_at: string
          updated_by: string | null
          updated_by_name: string | null
        }
        Insert: {
          age?: number | null
          ai_priority?: string | null
          assigned_to?: string | null
          assigned_to_id?: string | null
          assigned_to_name?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          dental_problem?: string | null
          email?: string | null
          estimated_value?: number | null
          follow_up_date?: string | null
          id?: string
          lead_score?: number
          meta_form_id?: string | null
          meta_form_name?: string | null
          meta_lead_id?: string | null
          name: string
          notes?: string | null
          phone: string
          source?: string
          status?: string
          treatment_interest?: string
          updated_at?: string
          updated_by?: string | null
          updated_by_name?: string | null
        }
        Update: {
          age?: number | null
          ai_priority?: string | null
          assigned_to?: string | null
          assigned_to_id?: string | null
          assigned_to_name?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          dental_problem?: string | null
          email?: string | null
          estimated_value?: number | null
          follow_up_date?: string | null
          id?: string
          lead_score?: number
          meta_form_id?: string | null
          meta_form_name?: string | null
          meta_lead_id?: string | null
          name?: string
          notes?: string | null
          phone?: string
          source?: string
          status?: string
          treatment_interest?: string
          updated_at?: string
          updated_by?: string | null
          updated_by_name?: string | null
        }
        Relationships: []
      }
      leave_balances: {
        Row: {
          allocated: number
          created_at: string
          employee_id: string
          id: string
          leave_type: string
          notes: string | null
          updated_at: string
          used: number
          year: number
        }
        Insert: {
          allocated?: number
          created_at?: string
          employee_id: string
          id?: string
          leave_type: string
          notes?: string | null
          updated_at?: string
          used?: number
          year: number
        }
        Update: {
          allocated?: number
          created_at?: string
          employee_id?: string
          id?: string
          leave_type?: string
          notes?: string | null
          updated_at?: string
          used?: number
          year?: number
        }
        Relationships: []
      }
      leave_requests: {
        Row: {
          admin_comment: string | null
          approved_by: string | null
          created_at: string
          days: number
          duration_type: string
          employee_id: string
          end_date: string
          id: string
          leave_type: string
          reason: string | null
          reporting_person: string | null
          reviewed_by: string | null
          start_date: string
          status: string
          year: number | null
        }
        Insert: {
          admin_comment?: string | null
          approved_by?: string | null
          created_at?: string
          days?: number
          duration_type?: string
          employee_id: string
          end_date: string
          id?: string
          leave_type?: string
          reason?: string | null
          reporting_person?: string | null
          reviewed_by?: string | null
          start_date: string
          status?: string
          year?: number | null
        }
        Update: {
          admin_comment?: string | null
          approved_by?: string | null
          created_at?: string
          days?: number
          duration_type?: string
          employee_id?: string
          end_date?: string
          id?: string
          leave_type?: string
          reason?: string | null
          reporting_person?: string | null
          reviewed_by?: string | null
          start_date?: string
          status?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_rollovers: {
        Row: {
          carry_forward: number
          created_at: string
          employee_id: string
          encashment: number
          enhancement: number
          from_year: number
          id: string
          leave_type: string
          notes: string | null
          remaining_unused: number
          to_year: number
          updated_at: string
        }
        Insert: {
          carry_forward?: number
          created_at?: string
          employee_id: string
          encashment?: number
          enhancement?: number
          from_year: number
          id?: string
          leave_type: string
          notes?: string | null
          remaining_unused?: number
          to_year: number
          updated_at?: string
        }
        Update: {
          carry_forward?: number
          created_at?: string
          employee_id?: string
          encashment?: number
          enhancement?: number
          from_year?: number
          id?: string
          leave_type?: string
          notes?: string | null
          remaining_unused?: number
          to_year?: number
          updated_at?: string
        }
        Relationships: []
      }
      licenses: {
        Row: {
          account_email: string | null
          auto_renew: boolean | null
          cost: number | null
          created_at: string
          created_by: string | null
          currency: string | null
          expiry_date: string
          id: string
          license_start_date: string | null
          license_type: string | null
          notes: string | null
          purchase_date: string | null
          reminder_days: number
          seats: number | null
          status: string
          updated_at: string
          vendor: string | null
          workspace_name: string
        }
        Insert: {
          account_email?: string | null
          auto_renew?: boolean | null
          cost?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          expiry_date: string
          id?: string
          license_start_date?: string | null
          license_type?: string | null
          notes?: string | null
          purchase_date?: string | null
          reminder_days?: number
          seats?: number | null
          status?: string
          updated_at?: string
          vendor?: string | null
          workspace_name: string
        }
        Update: {
          account_email?: string | null
          auto_renew?: boolean | null
          cost?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          expiry_date?: string
          id?: string
          license_start_date?: string | null
          license_type?: string | null
          notes?: string | null
          purchase_date?: string | null
          reminder_days?: number
          seats?: number | null
          status?: string
          updated_at?: string
          vendor?: string | null
          workspace_name?: string
        }
        Relationships: []
      }
      local_seo_snapshots: {
        Row: {
          ai_suggestions: Json
          checklist: Json
          created_at: string
          gsc_property: string | null
          id: string
          range_end: string | null
          range_start: string | null
          rankings: Json
          site_url: string
          sources: Json
          top_pages: Json
          totals: Json
          updated_at: string
        }
        Insert: {
          ai_suggestions?: Json
          checklist?: Json
          created_at?: string
          gsc_property?: string | null
          id?: string
          range_end?: string | null
          range_start?: string | null
          rankings?: Json
          site_url: string
          sources?: Json
          top_pages?: Json
          totals?: Json
          updated_at?: string
        }
        Update: {
          ai_suggestions?: Json
          checklist?: Json
          created_at?: string
          gsc_property?: string | null
          id?: string
          range_end?: string | null
          range_start?: string | null
          rankings?: Json
          site_url?: string
          sources?: Json
          top_pages?: Json
          totals?: Json
          updated_at?: string
        }
        Relationships: []
      }
      marketing_ad_spend: {
        Row: {
          amount: number
          campaign_name: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          period_end: string
          period_start: string
          platform: string
          updated_at: string
        }
        Insert: {
          amount?: number
          campaign_name: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          period_end: string
          period_start: string
          platform: string
          updated_at?: string
        }
        Update: {
          amount?: number
          campaign_name?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          period_end?: string
          period_start?: string
          platform?: string
          updated_at?: string
        }
        Relationships: []
      }
      marketing_projection_plan: {
        Row: {
          branch_id: string | null
          budget_allocated: number
          campaign_name: string
          channel: string
          created_at: string
          expected_revenue: number
          expected_roi_percent: number
          financial_year: string
          id: string
          lead_target: number
          month: number
          notes: string | null
          patient_target: number
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          budget_allocated?: number
          campaign_name: string
          channel?: string
          created_at?: string
          expected_revenue?: number
          expected_roi_percent?: number
          financial_year: string
          id?: string
          lead_target?: number
          month: number
          notes?: string | null
          patient_target?: number
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          budget_allocated?: number
          campaign_name?: string
          channel?: string
          created_at?: string
          expected_revenue?: number
          expected_roi_percent?: number
          financial_year?: string
          id?: string
          lead_target?: number
          month?: number
          notes?: string | null
          patient_target?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_projection_plan_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      medicine_dosages: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          medicine_type: string
          sort_order: number | null
          updated_at: string
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          medicine_type: string
          sort_order?: number | null
          updated_at?: string
          value: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          medicine_type?: string
          sort_order?: number | null
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      medicines: {
        Row: {
          afternoon: string | null
          created_at: string
          days: number | null
          dosage: string | null
          evening: string | null
          food_instruction: string | null
          id: string
          inventory_item_id: string | null
          is_active: boolean
          morning: string | null
          name: string
          night: string | null
          type: string | null
          unit: string
          unit_cost: number
          updated_at: string
        }
        Insert: {
          afternoon?: string | null
          created_at?: string
          days?: number | null
          dosage?: string | null
          evening?: string | null
          food_instruction?: string | null
          id?: string
          inventory_item_id?: string | null
          is_active?: boolean
          morning?: string | null
          name: string
          night?: string | null
          type?: string | null
          unit?: string
          unit_cost?: number
          updated_at?: string
        }
        Update: {
          afternoon?: string | null
          created_at?: string
          days?: number | null
          dosage?: string | null
          evening?: string | null
          food_instruction?: string | null
          id?: string
          inventory_item_id?: string | null
          is_active?: boolean
          morning?: string | null
          name?: string
          night?: string | null
          type?: string | null
          unit?: string
          unit_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medicines_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_action_items: {
        Row: {
          assignee_email: string | null
          assignee_name: string | null
          completed_at: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          meeting_id: string
          notes: string | null
          priority: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assignee_email?: string | null
          assignee_name?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          meeting_id: string
          notes?: string | null
          priority?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assignee_email?: string | null
          assignee_name?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          meeting_id?: string
          notes?: string | null
          priority?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_action_items_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_agenda_items: {
        Row: {
          attachment_name: string | null
          attachment_type: string | null
          attachment_url: string | null
          created_at: string
          duration_minutes: number
          id: string
          meeting_id: string
          notes: string | null
          position: number
          title: string
          updated_at: string
        }
        Insert: {
          attachment_name?: string | null
          attachment_type?: string | null
          attachment_url?: string | null
          created_at?: string
          duration_minutes?: number
          id?: string
          meeting_id: string
          notes?: string | null
          position?: number
          title: string
          updated_at?: string
        }
        Update: {
          attachment_name?: string | null
          attachment_type?: string | null
          attachment_url?: string | null
          created_at?: string
          duration_minutes?: number
          id?: string
          meeting_id?: string
          notes?: string | null
          position?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_agenda_items_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          agenda: string | null
          attendees: Json
          created_at: string
          created_by: string | null
          decisions: string | null
          duration_minutes: number
          frequency: string
          id: string
          location: string | null
          meeting_link: string | null
          notes: string | null
          organizer: string | null
          scheduled_at: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          agenda?: string | null
          attendees?: Json
          created_at?: string
          created_by?: string | null
          decisions?: string | null
          duration_minutes?: number
          frequency?: string
          id?: string
          location?: string | null
          meeting_link?: string | null
          notes?: string | null
          organizer?: string | null
          scheduled_at: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          agenda?: string | null
          attendees?: Json
          created_at?: string
          created_by?: string | null
          decisions?: string | null
          duration_minutes?: number
          frequency?: string
          id?: string
          location?: string | null
          meeting_link?: string | null
          notes?: string | null
          organizer?: string | null
          scheduled_at?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          is_read: boolean
          message: string | null
          read_at: string | null
          severity: string
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_read?: boolean
          message?: string | null
          read_at?: string | null
          severity?: string
          title: string
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_read?: boolean
          message?: string | null
          read_at?: string | null
          severity?: string
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      offer_letter_templates: {
        Row: {
          clauses: Json
          id: string
          template_key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          clauses?: Json
          id?: string
          template_key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          clauses?: Json
          id?: string
          template_key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      onboarding_tasks: {
        Row: {
          category: string | null
          completed_at: string | null
          created_at: string
          employee_id: string
          id: string
          is_completed: boolean | null
          notes: string | null
          task_name: string
        }
        Insert: {
          category?: string | null
          completed_at?: string | null
          created_at?: string
          employee_id: string
          id?: string
          is_completed?: boolean | null
          notes?: string | null
          task_name: string
        }
        Update: {
          category?: string | null
          completed_at?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          is_completed?: boolean | null
          notes?: string | null
          task_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_tasks_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      ops_task_checklist: {
        Row: {
          completed_at: string | null
          created_at: string
          date_end: string | null
          due_date: string | null
          id: string
          is_completed: boolean
          sort_order: number
          task_id: string
          title: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          date_end?: string | null
          due_date?: string | null
          id?: string
          is_completed?: boolean
          sort_order?: number
          task_id: string
          title: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          date_end?: string | null
          due_date?: string | null
          id?: string
          is_completed?: boolean
          sort_order?: number
          task_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "ops_task_checklist_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "ops_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      ops_tasks: {
        Row: {
          assigned_to: string | null
          category: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          date_end: string | null
          date_start: string | null
          department: string | null
          description: string | null
          due_date: string | null
          id: string
          is_completed: boolean
          priority: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          category?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          date_end?: string | null
          date_start?: string | null
          department?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_completed?: boolean
          priority?: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          category?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          date_end?: string | null
          date_start?: string | null
          department?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_completed?: boolean
          priority?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      orthodontic_cases: {
        Row: {
          appliance_brand: string | null
          appliance_type: string | null
          canine_relation: string | null
          case_code: string | null
          created_at: string
          crowding: string | null
          doctor: string | null
          estimated_months: number | null
          extraction_plan: string | null
          growth_pattern: string | null
          id: string
          installment_amount: number | null
          installment_frequency: string | null
          midline_deviation: string | null
          mini_implant_plan: string | null
          molar_relation: string | null
          next_due_date: string | null
          notes: string | null
          overbite: string | null
          overjet: string | null
          patient_id: string
          records: Json
          retainer_type: string | null
          retention_review_schedule: string | null
          retention_started_at: string | null
          spacing: string | null
          start_date: string | null
          status: string
          total_cost: number | null
          treatment_notes: string | null
          updated_at: string
          wire_sequence: Json
        }
        Insert: {
          appliance_brand?: string | null
          appliance_type?: string | null
          canine_relation?: string | null
          case_code?: string | null
          created_at?: string
          crowding?: string | null
          doctor?: string | null
          estimated_months?: number | null
          extraction_plan?: string | null
          growth_pattern?: string | null
          id?: string
          installment_amount?: number | null
          installment_frequency?: string | null
          midline_deviation?: string | null
          mini_implant_plan?: string | null
          molar_relation?: string | null
          next_due_date?: string | null
          notes?: string | null
          overbite?: string | null
          overjet?: string | null
          patient_id: string
          records?: Json
          retainer_type?: string | null
          retention_review_schedule?: string | null
          retention_started_at?: string | null
          spacing?: string | null
          start_date?: string | null
          status?: string
          total_cost?: number | null
          treatment_notes?: string | null
          updated_at?: string
          wire_sequence?: Json
        }
        Update: {
          appliance_brand?: string | null
          appliance_type?: string | null
          canine_relation?: string | null
          case_code?: string | null
          created_at?: string
          crowding?: string | null
          doctor?: string | null
          estimated_months?: number | null
          extraction_plan?: string | null
          growth_pattern?: string | null
          id?: string
          installment_amount?: number | null
          installment_frequency?: string | null
          midline_deviation?: string | null
          mini_implant_plan?: string | null
          molar_relation?: string | null
          next_due_date?: string | null
          notes?: string | null
          overbite?: string | null
          overjet?: string | null
          patient_id?: string
          records?: Json
          retainer_type?: string | null
          retention_review_schedule?: string | null
          retention_started_at?: string | null
          spacing?: string | null
          start_date?: string | null
          status?: string
          total_cost?: number | null
          treatment_notes?: string | null
          updated_at?: string
          wire_sequence?: Json
        }
        Relationships: []
      }
      orthodontic_payments: {
        Row: {
          amount: number
          case_id: string
          created_at: string
          due_date: string
          id: string
          notes: string | null
          paid_amount: number
          paid_date: string | null
          payment_method: string | null
          status: string
        }
        Insert: {
          amount: number
          case_id: string
          created_at?: string
          due_date: string
          id?: string
          notes?: string | null
          paid_amount?: number
          paid_date?: string | null
          payment_method?: string | null
          status?: string
        }
        Update: {
          amount?: number
          case_id?: string
          created_at?: string
          due_date?: string
          id?: string
          notes?: string | null
          paid_amount?: number
          paid_date?: string | null
          payment_method?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "orthodontic_payments_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "orthodontic_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      orthodontic_photos: {
        Row: {
          caption: string | null
          case_id: string
          created_at: string
          id: string
          phase: string | null
          photo_date: string
          photo_url: string
          visit_id: string | null
        }
        Insert: {
          caption?: string | null
          case_id: string
          created_at?: string
          id?: string
          phase?: string | null
          photo_date?: string
          photo_url: string
          visit_id?: string | null
        }
        Update: {
          caption?: string | null
          case_id?: string
          created_at?: string
          id?: string
          phase?: string | null
          photo_date?: string
          photo_url?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orthodontic_photos_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "orthodontic_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orthodontic_photos_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "orthodontic_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      orthodontic_records: {
        Row: {
          case_id: string
          created_at: string
          file_name: string
          file_path: string | null
          file_size: number | null
          file_url: string
          id: string
          mime_type: string | null
          notes: string | null
          patient_id: string
          record_type: string
          updated_at: string
          uploaded_at: string
        }
        Insert: {
          case_id: string
          created_at?: string
          file_name: string
          file_path?: string | null
          file_size?: number | null
          file_url: string
          id?: string
          mime_type?: string | null
          notes?: string | null
          patient_id: string
          record_type?: string
          updated_at?: string
          uploaded_at?: string
        }
        Update: {
          case_id?: string
          created_at?: string
          file_name?: string
          file_path?: string | null
          file_size?: number | null
          file_url?: string
          id?: string
          mime_type?: string | null
          notes?: string | null
          patient_id?: string
          record_type?: string
          updated_at?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orthodontic_records_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "orthodontic_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      orthodontic_visits: {
        Row: {
          case_id: string
          created_at: string
          doctor: string | null
          id: string
          next_visit_date: string | null
          notes: string | null
          phase: string | null
          procedures: Json
          visit_date: string
          wire_used: string | null
        }
        Insert: {
          case_id: string
          created_at?: string
          doctor?: string | null
          id?: string
          next_visit_date?: string | null
          notes?: string | null
          phase?: string | null
          procedures?: Json
          visit_date?: string
          wire_used?: string | null
        }
        Update: {
          case_id?: string
          created_at?: string
          doctor?: string | null
          id?: string
          next_visit_date?: string | null
          notes?: string | null
          phase?: string | null
          procedures?: Json
          visit_date?: string
          wire_used?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orthodontic_visits_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "orthodontic_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_checkins: {
        Row: {
          checkin_time: string
          checkout_time: string | null
          created_at: string
          id: string
          notes: string | null
          patient_id: string
          status: string
        }
        Insert: {
          checkin_time?: string
          checkout_time?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          patient_id: string
          status?: string
        }
        Update: {
          checkin_time?: string
          checkout_time?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          patient_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_checkins_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_recalls: {
        Row: {
          created_at: string
          id: string
          last_visit_date: string | null
          notes: string | null
          patient_id: string | null
          patient_name: string
          phone: string | null
          recall_date: string
          recall_type: string
          reminder_sent: boolean
          reminder_sent_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_visit_date?: string | null
          notes?: string | null
          patient_id?: string | null
          patient_name: string
          phone?: string | null
          recall_date: string
          recall_type: string
          reminder_sent?: boolean
          reminder_sent_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_visit_date?: string | null
          notes?: string | null
          patient_id?: string | null
          patient_name?: string
          phone?: string | null
          recall_date?: string
          recall_type?: string
          reminder_sent?: boolean
          reminder_sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_recalls_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_vitals: {
        Row: {
          blood_pressure_diastolic: number | null
          blood_pressure_systolic: number | null
          blood_sugar: number | null
          checkin_id: string
          created_at: string
          height: number | null
          id: string
          notes: string | null
          patient_id: string
          pulse_rate: number | null
          recorded_at: string
          spo2: number | null
          temperature: number | null
          weight: number | null
        }
        Insert: {
          blood_pressure_diastolic?: number | null
          blood_pressure_systolic?: number | null
          blood_sugar?: number | null
          checkin_id: string
          created_at?: string
          height?: number | null
          id?: string
          notes?: string | null
          patient_id: string
          pulse_rate?: number | null
          recorded_at?: string
          spo2?: number | null
          temperature?: number | null
          weight?: number | null
        }
        Update: {
          blood_pressure_diastolic?: number | null
          blood_pressure_systolic?: number | null
          blood_sugar?: number | null
          checkin_id?: string
          created_at?: string
          height?: number | null
          id?: string
          notes?: string | null
          patient_id?: string
          pulse_rate?: number | null
          recorded_at?: string
          spo2?: number | null
          temperature?: number | null
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_vitals_checkin_id_fkey"
            columns: ["checkin_id"]
            isOneToOne: false
            referencedRelation: "patient_checkins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_vitals_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          address: string | null
          created_at: string
          date_of_birth: string | null
          district: string | null
          email: string | null
          first_name: string
          gender: string | null
          id: string
          is_high_ticket: boolean
          last_name: string
          location: string | null
          medical_notes: string | null
          patient_code: number
          phone: string | null
          phone_country_code: string | null
          source: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          date_of_birth?: string | null
          district?: string | null
          email?: string | null
          first_name: string
          gender?: string | null
          id?: string
          is_high_ticket?: boolean
          last_name: string
          location?: string | null
          medical_notes?: string | null
          patient_code?: number
          phone?: string | null
          phone_country_code?: string | null
          source?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          date_of_birth?: string | null
          district?: string | null
          email?: string | null
          first_name?: string
          gender?: string | null
          id?: string
          is_high_ticket?: boolean
          last_name?: string
          location?: string | null
          medical_notes?: string | null
          patient_code?: number
          phone?: string | null
          phone_country_code?: string | null
          source?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      payroll: {
        Row: {
          base_salary: number | null
          benefits: number | null
          created_at: string
          ctc: number | null
          da: number | null
          employee_id: string
          esi_deduction: number | null
          gross_salary: number | null
          hra: number | null
          id: string
          leave_days: number | null
          lwf: number | null
          month: number
          net_salary: number | null
          notes: string | null
          other_allowances: number | null
          other_deductions: number | null
          payment_date: string | null
          payment_method: string | null
          payment_status: string | null
          payrun_id: string | null
          payslip_sent: boolean | null
          payslip_sent_at: string | null
          pf_deduction: number | null
          present_days: number | null
          professional_tax: number | null
          reimbursement: number | null
          tax_deduction: number | null
          tds: number | null
          total_deductions: number | null
          working_days: number | null
          year: number
        }
        Insert: {
          base_salary?: number | null
          benefits?: number | null
          created_at?: string
          ctc?: number | null
          da?: number | null
          employee_id: string
          esi_deduction?: number | null
          gross_salary?: number | null
          hra?: number | null
          id?: string
          leave_days?: number | null
          lwf?: number | null
          month: number
          net_salary?: number | null
          notes?: string | null
          other_allowances?: number | null
          other_deductions?: number | null
          payment_date?: string | null
          payment_method?: string | null
          payment_status?: string | null
          payrun_id?: string | null
          payslip_sent?: boolean | null
          payslip_sent_at?: string | null
          pf_deduction?: number | null
          present_days?: number | null
          professional_tax?: number | null
          reimbursement?: number | null
          tax_deduction?: number | null
          tds?: number | null
          total_deductions?: number | null
          working_days?: number | null
          year: number
        }
        Update: {
          base_salary?: number | null
          benefits?: number | null
          created_at?: string
          ctc?: number | null
          da?: number | null
          employee_id?: string
          esi_deduction?: number | null
          gross_salary?: number | null
          hra?: number | null
          id?: string
          leave_days?: number | null
          lwf?: number | null
          month?: number
          net_salary?: number | null
          notes?: string | null
          other_allowances?: number | null
          other_deductions?: number | null
          payment_date?: string | null
          payment_method?: string | null
          payment_status?: string | null
          payrun_id?: string | null
          payslip_sent?: boolean | null
          payslip_sent_at?: string | null
          pf_deduction?: number | null
          present_days?: number | null
          professional_tax?: number | null
          reimbursement?: number | null
          tax_deduction?: number | null
          tds?: number | null
          total_deductions?: number | null
          working_days?: number | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_banks: {
        Row: {
          account_holder: string | null
          account_number: string
          bank_name: string
          branch_name: string | null
          created_at: string
          excel_format: string | null
          id: string
          ifsc_code: string | null
          is_active: boolean | null
          updated_at: string
        }
        Insert: {
          account_holder?: string | null
          account_number: string
          bank_name: string
          branch_name?: string | null
          created_at?: string
          excel_format?: string | null
          id?: string
          ifsc_code?: string | null
          is_active?: boolean | null
          updated_at?: string
        }
        Update: {
          account_holder?: string | null
          account_number?: string
          bank_name?: string
          branch_name?: string | null
          created_at?: string
          excel_format?: string | null
          id?: string
          ifsc_code?: string | null
          is_active?: boolean | null
          updated_at?: string
        }
        Relationships: []
      }
      payruns: {
        Row: {
          band: string | null
          bank_account: string | null
          bank_name: string | null
          created_at: string
          employment_type: string | null
          financial_year: string
          id: string
          location: string | null
          name: string
          notes: string | null
          pay_period_end: string
          pay_period_month: number
          pay_period_start: string
          pay_period_year: number
          payment_details: Json | null
          payrun_type: string | null
          proceed_date: string | null
          status: string | null
          total_benefits: number | null
          total_ctc: number | null
          total_deductions: number | null
          total_employees: number | null
          total_net_pay: number | null
          total_reimbursement: number | null
          total_tax: number | null
          updated_at: string
        }
        Insert: {
          band?: string | null
          bank_account?: string | null
          bank_name?: string | null
          created_at?: string
          employment_type?: string | null
          financial_year: string
          id?: string
          location?: string | null
          name: string
          notes?: string | null
          pay_period_end: string
          pay_period_month: number
          pay_period_start: string
          pay_period_year: number
          payment_details?: Json | null
          payrun_type?: string | null
          proceed_date?: string | null
          status?: string | null
          total_benefits?: number | null
          total_ctc?: number | null
          total_deductions?: number | null
          total_employees?: number | null
          total_net_pay?: number | null
          total_reimbursement?: number | null
          total_tax?: number | null
          updated_at?: string
        }
        Update: {
          band?: string | null
          bank_account?: string | null
          bank_name?: string | null
          created_at?: string
          employment_type?: string | null
          financial_year?: string
          id?: string
          location?: string | null
          name?: string
          notes?: string | null
          pay_period_end?: string
          pay_period_month?: number
          pay_period_start?: string
          pay_period_year?: number
          payment_details?: Json | null
          payrun_type?: string | null
          proceed_date?: string | null
          status?: string | null
          total_benefits?: number | null
          total_ctc?: number | null
          total_deductions?: number | null
          total_employees?: number | null
          total_net_pay?: number | null
          total_reimbursement?: number | null
          total_tax?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      performance_logs: {
        Row: {
          created_at: string
          employee_id: string
          id: string
          log_date: string
          metric_name: string
          notes: string | null
          value: number
        }
        Insert: {
          created_at?: string
          employee_id: string
          id?: string
          log_date?: string
          metric_name: string
          notes?: string | null
          value?: number
        }
        Update: {
          created_at?: string
          employee_id?: string
          id?: string
          log_date?: string
          metric_name?: string
          notes?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "performance_logs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_points: {
        Row: {
          created_at: string
          employee_id: string
          id: string
          metric_name: string | null
          period_date: string
          points: number
          reason: string | null
          source: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          id?: string
          metric_name?: string | null
          period_date?: string
          points?: number
          reason?: string | null
          source?: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          id?: string
          metric_name?: string | null
          period_date?: string
          points?: number
          reason?: string | null
          source?: string
        }
        Relationships: []
      }
      pharma_quality_logs: {
        Row: {
          action_taken: string | null
          batch_number: string | null
          brand_name: string | null
          created_at: string
          doctor_name: string | null
          drug_name: string
          id: string
          notes: string | null
          patient_id: string | null
          patient_name: string
          reaction_description: string
          reaction_type: string
          reported_date: string
          severity: string
          status: string
        }
        Insert: {
          action_taken?: string | null
          batch_number?: string | null
          brand_name?: string | null
          created_at?: string
          doctor_name?: string | null
          drug_name: string
          id?: string
          notes?: string | null
          patient_id?: string | null
          patient_name: string
          reaction_description: string
          reaction_type?: string
          reported_date?: string
          severity?: string
          status?: string
        }
        Update: {
          action_taken?: string | null
          batch_number?: string | null
          brand_name?: string | null
          created_at?: string
          doctor_name?: string | null
          drug_name?: string
          id?: string
          notes?: string | null
          patient_id?: string | null
          patient_name?: string
          reaction_description?: string
          reaction_type?: string
          reported_date?: string
          severity?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "pharma_quality_logs_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      prescription_items: {
        Row: {
          created_at: string
          dosage: string | null
          duration: string | null
          frequency: string | null
          id: string
          instructions: string | null
          medicine_name: string
          prescription_id: string
        }
        Insert: {
          created_at?: string
          dosage?: string | null
          duration?: string | null
          frequency?: string | null
          id?: string
          instructions?: string | null
          medicine_name: string
          prescription_id: string
        }
        Update: {
          created_at?: string
          dosage?: string | null
          duration?: string | null
          frequency?: string | null
          id?: string
          instructions?: string | null
          medicine_name?: string
          prescription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prescription_items_prescription_id_fkey"
            columns: ["prescription_id"]
            isOneToOne: false
            referencedRelation: "prescriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      prescription_template_items: {
        Row: {
          afternoon: string | null
          created_at: string
          dosage: string | null
          duration: string | null
          evening: string | null
          frequency: string | null
          id: string
          instructions: string | null
          medicine_name: string
          morning: string | null
          night: string | null
          sort_order: number | null
          template_id: string
        }
        Insert: {
          afternoon?: string | null
          created_at?: string
          dosage?: string | null
          duration?: string | null
          evening?: string | null
          frequency?: string | null
          id?: string
          instructions?: string | null
          medicine_name: string
          morning?: string | null
          night?: string | null
          sort_order?: number | null
          template_id: string
        }
        Update: {
          afternoon?: string | null
          created_at?: string
          dosage?: string | null
          duration?: string | null
          evening?: string | null
          frequency?: string | null
          id?: string
          instructions?: string | null
          medicine_name?: string
          morning?: string | null
          night?: string | null
          sort_order?: number | null
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prescription_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "prescription_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      prescription_templates: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          treatment_category: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          treatment_category?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          treatment_category?: string
          updated_at?: string
        }
        Relationships: []
      }
      prescriptions: {
        Row: {
          checkin_id: string | null
          created_at: string
          diagnosis: string | null
          doctor: string | null
          id: string
          notes: string | null
          patient_id: string
        }
        Insert: {
          checkin_id?: string | null
          created_at?: string
          diagnosis?: string | null
          doctor?: string | null
          id?: string
          notes?: string | null
          patient_id: string
        }
        Update: {
          checkin_id?: string | null
          created_at?: string
          diagnosis?: string | null
          doctor?: string | null
          id?: string
          notes?: string | null
          patient_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prescriptions_checkin_id_fkey"
            columns: ["checkin_id"]
            isOneToOne: false
            referencedRelation: "patient_checkins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      profit_projection_summary: {
        Row: {
          branch_id: string | null
          created_at: string
          financial_year: string
          id: string
          marketing_expense_target: number
          net_profit_target: number
          operational_expense_target: number
          profit_margin_target: number
          salary_expense_target: number
          total_expense_target: number
          total_revenue_target: number
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          financial_year: string
          id?: string
          marketing_expense_target?: number
          net_profit_target?: number
          operational_expense_target?: number
          profit_margin_target?: number
          salary_expense_target?: number
          total_expense_target?: number
          total_revenue_target?: number
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          financial_year?: string
          id?: string
          marketing_expense_target?: number
          net_profit_target?: number
          operational_expense_target?: number
          profit_margin_target?: number
          salary_expense_target?: number
          total_expense_target?: number
          total_revenue_target?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profit_projection_summary_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_items: {
        Row: {
          batch_number: string | null
          category: string | null
          created_at: string
          expiry_date: string | null
          id: string
          inventory_item_id: string | null
          item_name: string
          purchase_id: string
          quantity: number
          stock_applied: boolean
          total_price: number
          unit: string
          unit_price: number
        }
        Insert: {
          batch_number?: string | null
          category?: string | null
          created_at?: string
          expiry_date?: string | null
          id?: string
          inventory_item_id?: string | null
          item_name: string
          purchase_id: string
          quantity?: number
          stock_applied?: boolean
          total_price?: number
          unit?: string
          unit_price?: number
        }
        Update: {
          batch_number?: string | null
          category?: string | null
          created_at?: string
          expiry_date?: string | null
          id?: string
          inventory_item_id?: string | null
          item_name?: string
          purchase_id?: string
          quantity?: number
          stock_applied?: boolean
          total_price?: number
          unit?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_items_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      purchases: {
        Row: {
          amount_paid: number
          cgst_rate: number
          created_at: string
          delivery_date: string | null
          delivery_status: string
          discount_amount: number | null
          id: string
          invoice_file_url: string | null
          invoice_number: string | null
          notes: string | null
          payment_due_date: string | null
          payment_method: string | null
          payment_paid_date: string | null
          payment_proof_url: string | null
          payment_status: string
          purchase_date: string
          sgst_rate: number
          subtotal: number
          supplier_name: string
          supplier_phone: string | null
          supplier_type: string
          tax_amount: number | null
          total_amount: number
          updated_at: string
        }
        Insert: {
          amount_paid?: number
          cgst_rate?: number
          created_at?: string
          delivery_date?: string | null
          delivery_status?: string
          discount_amount?: number | null
          id?: string
          invoice_file_url?: string | null
          invoice_number?: string | null
          notes?: string | null
          payment_due_date?: string | null
          payment_method?: string | null
          payment_paid_date?: string | null
          payment_proof_url?: string | null
          payment_status?: string
          purchase_date?: string
          sgst_rate?: number
          subtotal?: number
          supplier_name: string
          supplier_phone?: string | null
          supplier_type?: string
          tax_amount?: number | null
          total_amount?: number
          updated_at?: string
        }
        Update: {
          amount_paid?: number
          cgst_rate?: number
          created_at?: string
          delivery_date?: string | null
          delivery_status?: string
          discount_amount?: number | null
          id?: string
          invoice_file_url?: string | null
          invoice_number?: string | null
          notes?: string | null
          payment_due_date?: string | null
          payment_method?: string | null
          payment_paid_date?: string | null
          payment_proof_url?: string | null
          payment_status?: string
          purchase_date?: string
          sgst_rate?: number
          subtotal?: number
          supplier_name?: string
          supplier_phone?: string | null
          supplier_type?: string
          tax_amount?: number | null
          total_amount?: number
          updated_at?: string
        }
        Relationships: []
      }
      receivable_adjustments: {
        Row: {
          adjusted_at: string
          adjusted_by: string | null
          adjustment_type: string
          amount: number
          billing_id: string
          id: string
          patient_id: string | null
          pending_after: number
          pending_before: number
          reason: string
          reverses_id: string | null
        }
        Insert: {
          adjusted_at?: string
          adjusted_by?: string | null
          adjustment_type: string
          amount: number
          billing_id: string
          id?: string
          patient_id?: string | null
          pending_after: number
          pending_before: number
          reason: string
          reverses_id?: string | null
        }
        Update: {
          adjusted_at?: string
          adjusted_by?: string | null
          adjustment_type?: string
          amount?: number
          billing_id?: string
          id?: string
          patient_id?: string | null
          pending_after?: number
          pending_before?: number
          reason?: string
          reverses_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "receivable_adjustments_billing_id_fkey"
            columns: ["billing_id"]
            isOneToOne: false
            referencedRelation: "billings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receivable_adjustments_reverses_id_fkey"
            columns: ["reverses_id"]
            isOneToOne: false
            referencedRelation: "receivable_adjustments"
            referencedColumns: ["id"]
          },
        ]
      }
      recruitment_activities: {
        Row: {
          activity_type: string
          candidate_id: string
          conducted_by: string | null
          conducted_by_name: string | null
          created_at: string
          created_by: string | null
          feedback: string | null
          id: string
          outcome: string | null
          scheduled_at: string | null
          score: number | null
          stage: string
        }
        Insert: {
          activity_type?: string
          candidate_id: string
          conducted_by?: string | null
          conducted_by_name?: string | null
          created_at?: string
          created_by?: string | null
          feedback?: string | null
          id?: string
          outcome?: string | null
          scheduled_at?: string | null
          score?: number | null
          stage: string
        }
        Update: {
          activity_type?: string
          candidate_id?: string
          conducted_by?: string | null
          conducted_by_name?: string | null
          created_at?: string
          created_by?: string | null
          feedback?: string | null
          id?: string
          outcome?: string | null
          scheduled_at?: string | null
          score?: number | null
          stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "recruitment_activities_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "recruitment_candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      recruitment_candidates: {
        Row: {
          assigned_to: string | null
          created_at: string
          created_by: string | null
          current_company: string | null
          current_ctc: number | null
          current_designation: string | null
          current_stage: string
          date_of_joining: string | null
          email: string | null
          expected_ctc: number | null
          experience_years: number | null
          full_name: string
          id: string
          job_opening_id: string | null
          location: string | null
          notes: string | null
          notice_period_days: number | null
          offer_amount: number | null
          phone: string
          rating: number | null
          rejection_reason: string | null
          resume_url: string | null
          skills: string | null
          source: string
          source_details: string | null
          status: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          current_company?: string | null
          current_ctc?: number | null
          current_designation?: string | null
          current_stage?: string
          date_of_joining?: string | null
          email?: string | null
          expected_ctc?: number | null
          experience_years?: number | null
          full_name: string
          id?: string
          job_opening_id?: string | null
          location?: string | null
          notes?: string | null
          notice_period_days?: number | null
          offer_amount?: number | null
          phone: string
          rating?: number | null
          rejection_reason?: string | null
          resume_url?: string | null
          skills?: string | null
          source?: string
          source_details?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          current_company?: string | null
          current_ctc?: number | null
          current_designation?: string | null
          current_stage?: string
          date_of_joining?: string | null
          email?: string | null
          expected_ctc?: number | null
          experience_years?: number | null
          full_name?: string
          id?: string
          job_opening_id?: string | null
          location?: string | null
          notes?: string | null
          notice_period_days?: number | null
          offer_amount?: number | null
          phone?: string
          rating?: number | null
          rejection_reason?: string | null
          resume_url?: string | null
          skills?: string | null
          source?: string
          source_details?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recruitment_candidates_job_opening_id_fkey"
            columns: ["job_opening_id"]
            isOneToOne: false
            referencedRelation: "job_openings"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          converted_at: string | null
          created_at: string
          id: string
          referral_code: string | null
          referred_name: string
          referred_patient_id: string | null
          referred_phone: string
          referrer_name: string
          referrer_patient_id: string | null
          referrer_phone: string | null
          revenue_generated: number | null
          reward_given: boolean
          reward_type: string | null
          status: string
          treatment_booked: string | null
        }
        Insert: {
          converted_at?: string | null
          created_at?: string
          id?: string
          referral_code?: string | null
          referred_name: string
          referred_patient_id?: string | null
          referred_phone: string
          referrer_name: string
          referrer_patient_id?: string | null
          referrer_phone?: string | null
          revenue_generated?: number | null
          reward_given?: boolean
          reward_type?: string | null
          status?: string
          treatment_booked?: string | null
        }
        Update: {
          converted_at?: string | null
          created_at?: string
          id?: string
          referral_code?: string | null
          referred_name?: string
          referred_patient_id?: string | null
          referred_phone?: string
          referrer_name?: string
          referrer_patient_id?: string | null
          referrer_phone?: string | null
          revenue_generated?: number | null
          reward_given?: boolean
          reward_type?: string | null
          status?: string
          treatment_booked?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referrals_referred_patient_id_fkey"
            columns: ["referred_patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_patient_id_fkey"
            columns: ["referrer_patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      review_requests: {
        Row: {
          appointment_id: string | null
          clicked_at: string | null
          created_at: string
          delivery_error: string | null
          id: string
          patient_id: string | null
          patient_name: string
          phone: string | null
          rating: number | null
          review_platform: string | null
          review_received: boolean
          review_text: string | null
          reviewed_at: string | null
          sent_at: string
          source: string
          status: string
          tracking_token: string
        }
        Insert: {
          appointment_id?: string | null
          clicked_at?: string | null
          created_at?: string
          delivery_error?: string | null
          id?: string
          patient_id?: string | null
          patient_name: string
          phone?: string | null
          rating?: number | null
          review_platform?: string | null
          review_received?: boolean
          review_text?: string | null
          reviewed_at?: string | null
          sent_at?: string
          source?: string
          status?: string
          tracking_token?: string
        }
        Update: {
          appointment_id?: string | null
          clicked_at?: string | null
          created_at?: string
          delivery_error?: string | null
          id?: string
          patient_id?: string | null
          patient_name?: string
          phone?: string | null
          rating?: number | null
          review_platform?: string | null
          review_received?: boolean
          review_text?: string | null
          reviewed_at?: string | null
          sent_at?: string
          source?: string
          status?: string
          tracking_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_requests_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      role_hidden_presets: {
        Row: {
          created_at: string
          id: string
          preset_kind: string
          preset_name: string
          role_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          preset_kind: string
          preset_name: string
          role_id: string
        }
        Update: {
          created_at?: string
          id?: string
          preset_kind?: string
          preset_name?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_hidden_presets_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "department_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      role_metrics: {
        Row: {
          created_at: string
          default_target: number
          id: string
          is_active: boolean
          metric_name: string
          points_per_unit: number
          role_id: string
          target_kind_id: string | null
          unit: string
          updated_at: string
          weight: number
        }
        Insert: {
          created_at?: string
          default_target?: number
          id?: string
          is_active?: boolean
          metric_name: string
          points_per_unit?: number
          role_id: string
          target_kind_id?: string | null
          unit?: string
          updated_at?: string
          weight?: number
        }
        Update: {
          created_at?: string
          default_target?: number
          id?: string
          is_active?: boolean
          metric_name?: string
          points_per_unit?: number
          role_id?: string
          target_kind_id?: string | null
          unit?: string
          updated_at?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "role_metrics_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "department_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_metrics_target_kind_id_fkey"
            columns: ["target_kind_id"]
            isOneToOne: false
            referencedRelation: "role_target_kinds"
            referencedColumns: ["id"]
          },
        ]
      }
      role_target_kind_overrides: {
        Row: {
          base_kind: string
          created_at: string
          id: string
          is_hidden: boolean
          kind_label: string
          role_id: string
          updated_at: string
        }
        Insert: {
          base_kind: string
          created_at?: string
          id?: string
          is_hidden?: boolean
          kind_label: string
          role_id: string
          updated_at?: string
        }
        Update: {
          base_kind?: string
          created_at?: string
          id?: string
          is_hidden?: boolean
          kind_label?: string
          role_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_target_kind_overrides_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "department_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      role_target_kinds: {
        Row: {
          base_kind: string
          created_at: string
          id: string
          is_active: boolean
          kind_label: string
          role_id: string
          updated_at: string
        }
        Insert: {
          base_kind?: string
          created_at?: string
          id?: string
          is_active?: boolean
          kind_label: string
          role_id: string
          updated_at?: string
        }
        Update: {
          base_kind?: string
          created_at?: string
          id?: string
          is_active?: boolean
          kind_label?: string
          role_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_target_kinds_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "department_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      scan_centers: {
        Row: {
          address: string | null
          contact: string | null
          contact_person: string | null
          created_at: string
          id: string
          is_active: boolean
          location: string | null
          mobile: string | null
          name: string
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          contact?: string | null
          contact_person?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          location?: string | null
          mobile?: string | null
          name: string
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          contact?: string | null
          contact_person?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          location?: string | null
          mobile?: string | null
          name?: string
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      scan_tests: {
        Row: {
          category: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      screening_leads: {
        Row: {
          age: number | null
          campaign_id: string
          chief_complaint: string | null
          chief_complaints: string[] | null
          converted_to_patient: boolean | null
          coupon_issued: boolean | null
          created_at: string
          dental_concern: string | null
          department_class: string | null
          doctor_name: string | null
          email: string | null
          followup_status: string | null
          gender: string | null
          id: string
          institution_name: string | null
          interested_in_visit: boolean | null
          mobile: string | null
          participant_name: string
          priority_level: string | null
          recommended_treatment: string | null
          screened: boolean
          screening_findings: string | null
          source: string
          treatment_tags: string[] | null
          unique_code: string | null
          updated_at: string
        }
        Insert: {
          age?: number | null
          campaign_id: string
          chief_complaint?: string | null
          chief_complaints?: string[] | null
          converted_to_patient?: boolean | null
          coupon_issued?: boolean | null
          created_at?: string
          dental_concern?: string | null
          department_class?: string | null
          doctor_name?: string | null
          email?: string | null
          followup_status?: string | null
          gender?: string | null
          id?: string
          institution_name?: string | null
          interested_in_visit?: boolean | null
          mobile?: string | null
          participant_name: string
          priority_level?: string | null
          recommended_treatment?: string | null
          screened?: boolean
          screening_findings?: string | null
          source?: string
          treatment_tags?: string[] | null
          unique_code?: string | null
          updated_at?: string
        }
        Update: {
          age?: number | null
          campaign_id?: string
          chief_complaint?: string | null
          chief_complaints?: string[] | null
          converted_to_patient?: boolean | null
          coupon_issued?: boolean | null
          created_at?: string
          dental_concern?: string | null
          department_class?: string | null
          doctor_name?: string | null
          email?: string | null
          followup_status?: string | null
          gender?: string | null
          id?: string
          institution_name?: string | null
          interested_in_visit?: boolean | null
          mobile?: string | null
          participant_name?: string
          priority_level?: string | null
          recommended_treatment?: string | null
          screened?: boolean
          screening_findings?: string | null
          source?: string
          treatment_tags?: string[] | null
          unique_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "screening_leads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      smile_simulations: {
        Row: {
          after_image_url: string | null
          approved_at: string | null
          approved_by: string | null
          before_image_url: string | null
          created_at: string
          created_by: string | null
          detected_teeth: Json | null
          doctor: string | null
          face_photo_url: string | null
          id: string
          intraoral_photos: Json | null
          notes: string | null
          occlusal_photos: Json | null
          patient_feedback: string | null
          patient_id: string | null
          patient_name: string | null
          simulation_mode: string | null
          smile_photo_url: string | null
          status: string | null
          treatment_plan: Json | null
          updated_at: string
        }
        Insert: {
          after_image_url?: string | null
          approved_at?: string | null
          approved_by?: string | null
          before_image_url?: string | null
          created_at?: string
          created_by?: string | null
          detected_teeth?: Json | null
          doctor?: string | null
          face_photo_url?: string | null
          id?: string
          intraoral_photos?: Json | null
          notes?: string | null
          occlusal_photos?: Json | null
          patient_feedback?: string | null
          patient_id?: string | null
          patient_name?: string | null
          simulation_mode?: string | null
          smile_photo_url?: string | null
          status?: string | null
          treatment_plan?: Json | null
          updated_at?: string
        }
        Update: {
          after_image_url?: string | null
          approved_at?: string | null
          approved_by?: string | null
          before_image_url?: string | null
          created_at?: string
          created_by?: string | null
          detected_teeth?: Json | null
          doctor?: string | null
          face_photo_url?: string | null
          id?: string
          intraoral_photos?: Json | null
          notes?: string | null
          occlusal_photos?: Json | null
          patient_feedback?: string | null
          patient_id?: string | null
          patient_name?: string | null
          simulation_mode?: string | null
          smile_photo_url?: string | null
          status?: string | null
          treatment_plan?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "smile_simulations_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      social_messages: {
        Row: {
          created_at: string
          id: string
          message: string | null
          message_type: string
          platform: string
          sender_name: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string | null
          message_type?: string
          platform?: string
          sender_name?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string | null
          message_type?: string
          platform?: string
          sender_name?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      social_post_targets: {
        Row: {
          attempted_at: string | null
          created_at: string
          error_code: string | null
          error_message: string | null
          external_post_id: string | null
          id: string
          permalink: string | null
          platform: string
          post_id: string
          published_at: string | null
          status: string
        }
        Insert: {
          attempted_at?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          external_post_id?: string | null
          id?: string
          permalink?: string | null
          platform: string
          post_id: string
          published_at?: string | null
          status?: string
        }
        Update: {
          attempted_at?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          external_post_id?: string | null
          id?: string
          permalink?: string | null
          platform?: string
          post_id?: string
          published_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_post_targets_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      social_posts: {
        Row: {
          caption: string
          created_at: string
          created_by: string
          hashtags: string | null
          id: string
          link_url: string | null
          media: Json
          platforms: string[]
          post_type: string | null
          scheduled_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          caption?: string
          created_at?: string
          created_by?: string
          hashtags?: string | null
          id?: string
          link_url?: string | null
          media?: Json
          platforms?: string[]
          post_type?: string | null
          scheduled_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          caption?: string
          created_at?: string
          created_by?: string
          hashtags?: string | null
          id?: string
          link_url?: string | null
          media?: Json
          platforms?: string[]
          post_type?: string | null
          scheduled_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      staff_projection_targets: {
        Row: {
          branch_id: string | null
          conversion_target: number
          created_at: string
          financial_year: string
          id: string
          monthly_revenue_target: number
          patient_handling_target: number
          performance_score_target: number
          recall_target: number
          role: string
          staff_id: string | null
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          conversion_target?: number
          created_at?: string
          financial_year: string
          id?: string
          monthly_revenue_target?: number
          patient_handling_target?: number
          performance_score_target?: number
          recall_target?: number
          role?: string
          staff_id?: string | null
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          conversion_target?: number
          created_at?: string
          financial_year?: string
          id?: string
          monthly_revenue_target?: number
          patient_handling_target?: number
          performance_score_target?: number
          recall_target?: number
          role?: string
          staff_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_projection_targets_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_projection_targets_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      sterilization_logs: {
        Row: {
          batch_id: string | null
          created_at: string
          cycle_number: number | null
          duration_minutes: number | null
          id: string
          instrument_name: string
          notes: string | null
          performed_at: string
          performed_by: string
          pressure: string | null
          result: string
          sterilization_method: string
          temperature: string | null
        }
        Insert: {
          batch_id?: string | null
          created_at?: string
          cycle_number?: number | null
          duration_minutes?: number | null
          id?: string
          instrument_name: string
          notes?: string | null
          performed_at?: string
          performed_by: string
          pressure?: string | null
          result?: string
          sterilization_method?: string
          temperature?: string | null
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          cycle_number?: number | null
          duration_minutes?: number | null
          id?: string
          instrument_name?: string
          notes?: string | null
          performed_at?: string
          performed_by?: string
          pressure?: string | null
          result?: string
          sterilization_method?: string
          temperature?: string | null
        }
        Relationships: []
      }
      supplier_items: {
        Row: {
          brand: string | null
          category: string
          cost_price: number | null
          created_at: string
          id: string
          name: string
          notes: string | null
          quantity: number | null
          status: string | null
          supplier_id: string | null
          unit: string | null
          updated_at: string
        }
        Insert: {
          brand?: string | null
          category?: string
          cost_price?: number | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          quantity?: number | null
          status?: string | null
          supplier_id?: string | null
          unit?: string | null
          updated_at?: string
        }
        Update: {
          brand?: string | null
          category?: string
          cost_price?: number | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          quantity?: number | null
          status?: string | null
          supplier_id?: string | null
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_items_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          category: string | null
          contact_person: string | null
          created_at: string
          email: string | null
          gst_number: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          supplier_code: string | null
        }
        Insert: {
          address?: string | null
          category?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          gst_number?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          supplier_code?: string | null
        }
        Update: {
          address?: string | null
          category?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          gst_number?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          supplier_code?: string | null
        }
        Relationships: []
      }
      training_programs: {
        Row: {
          category: string
          created_at: string
          description: string | null
          duration_hours: number | null
          id: string
          is_active: boolean
          materials_url: string | null
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          duration_hours?: number | null
          id?: string
          is_active?: boolean
          materials_url?: string | null
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          duration_hours?: number | null
          id?: string
          is_active?: boolean
          materials_url?: string | null
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      treatment_plan_items: {
        Row: {
          assistant: string | null
          completed_at: string | null
          created_at: string
          description: string | null
          doctor: string | null
          estimated_cost: number | null
          id: string
          plan_id: string
          priority: string | null
          status: string
          tooth_number: number | null
          treatment_type: string
        }
        Insert: {
          assistant?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          doctor?: string | null
          estimated_cost?: number | null
          id?: string
          plan_id: string
          priority?: string | null
          status?: string
          tooth_number?: number | null
          treatment_type: string
        }
        Update: {
          assistant?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          doctor?: string | null
          estimated_cost?: number | null
          id?: string
          plan_id?: string
          priority?: string | null
          status?: string
          tooth_number?: number | null
          treatment_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "treatment_plan_items_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "treatment_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      treatment_plans: {
        Row: {
          chart_id: string | null
          checkin_id: string | null
          created_at: string
          doctor: string | null
          id: string
          notes: string | null
          patient_id: string
          status: string
          total_estimated_cost: number | null
          updated_at: string
        }
        Insert: {
          chart_id?: string | null
          checkin_id?: string | null
          created_at?: string
          doctor?: string | null
          id?: string
          notes?: string | null
          patient_id: string
          status?: string
          total_estimated_cost?: number | null
          updated_at?: string
        }
        Update: {
          chart_id?: string | null
          checkin_id?: string | null
          created_at?: string
          doctor?: string | null
          id?: string
          notes?: string | null
          patient_id?: string
          status?: string
          total_estimated_cost?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "treatment_plans_chart_id_fkey"
            columns: ["chart_id"]
            isOneToOne: false
            referencedRelation: "dental_charts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_plans_checkin_id_fkey"
            columns: ["checkin_id"]
            isOneToOne: false
            referencedRelation: "patient_checkins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_plans_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      user_branches: {
        Row: {
          branch_id: string
          created_at: string
          id: string
          is_default: boolean
          user_id: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          id?: string
          is_default?: boolean
          user_id: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          id?: string
          is_default?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_branches_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      user_module_access: {
        Row: {
          can_create: boolean
          can_delete: boolean
          can_edit: boolean
          can_read: boolean
          created_at: string
          has_access: boolean
          id: string
          module_path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_read?: boolean
          created_at?: string
          has_access?: boolean
          id?: string
          module_path: string
          updated_at?: string
          user_id: string
        }
        Update: {
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_read?: boolean
          created_at?: string
          has_access?: boolean
          id?: string
          module_path?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_reports_to: {
        Row: {
          created_at: string
          id: string
          manager_user_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          manager_user_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          manager_user_id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      waste_agencies: {
        Row: {
          contact_person: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          phone: string | null
        }
        Insert: {
          contact_person?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
        }
        Update: {
          contact_person?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
        }
        Relationships: []
      }
      waste_logs: {
        Row: {
          collected_by: string | null
          collected_by_person: string | null
          collection_date: string
          collection_time: string | null
          created_at: string
          disposed_by: string | null
          id: string
          is_collected: boolean
          items_description: string
          manifest_number: string | null
          notes: string | null
          quantity: number
          unit: string
          waste_category: string
          waste_type: string
        }
        Insert: {
          collected_by?: string | null
          collected_by_person?: string | null
          collection_date?: string
          collection_time?: string | null
          created_at?: string
          disposed_by?: string | null
          id?: string
          is_collected?: boolean
          items_description: string
          manifest_number?: string | null
          notes?: string | null
          quantity?: number
          unit?: string
          waste_category?: string
          waste_type?: string
        }
        Update: {
          collected_by?: string | null
          collected_by_person?: string | null
          collection_date?: string
          collection_time?: string | null
          created_at?: string
          disposed_by?: string | null
          id?: string
          is_collected?: boolean
          items_description?: string
          manifest_number?: string | null
          notes?: string | null
          quantity?: number
          unit?: string
          waste_category?: string
          waste_type?: string
        }
        Relationships: []
      }
      whatsapp_billing_receipts: {
        Row: {
          amount: number
          currency: string
          entered_by: string | null
          id: string
          month: string
          source: string
          updated_at: string
        }
        Insert: {
          amount?: number
          currency?: string
          entered_by?: string | null
          id?: string
          month: string
          source?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          currency?: string
          entered_by?: string | null
          id?: string
          month?: string
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_blocked_numbers: {
        Row: {
          blocked: boolean
          created_at: string
          error_code: number | null
          failure_count: number
          first_failed_at: string
          id: string
          last_failed_at: string
          reason: string | null
          source: string | null
          updated_at: string
          wa_phone: string
        }
        Insert: {
          blocked?: boolean
          created_at?: string
          error_code?: number | null
          failure_count?: number
          first_failed_at?: string
          id?: string
          last_failed_at?: string
          reason?: string | null
          source?: string | null
          updated_at?: string
          wa_phone: string
        }
        Update: {
          blocked?: boolean
          created_at?: string
          error_code?: number | null
          failure_count?: number
          first_failed_at?: string
          id?: string
          last_failed_at?: string
          reason?: string | null
          source?: string | null
          updated_at?: string
          wa_phone?: string
        }
        Relationships: []
      }
      whatsapp_campaigns: {
        Row: {
          campaign_type: string
          created_at: string
          delivered_count: number
          id: string
          message_template: string
          name: string
          read_count: number
          response_count: number
          scheduled_at: string | null
          sent_at: string | null
          sent_count: number
          status: string
          target_segment: string | null
          total_recipients: number
        }
        Insert: {
          campaign_type?: string
          created_at?: string
          delivered_count?: number
          id?: string
          message_template: string
          name: string
          read_count?: number
          response_count?: number
          scheduled_at?: string | null
          sent_at?: string | null
          sent_count?: number
          status?: string
          target_segment?: string | null
          total_recipients?: number
        }
        Update: {
          campaign_type?: string
          created_at?: string
          delivered_count?: number
          id?: string
          message_template?: string
          name?: string
          read_count?: number
          response_count?: number
          scheduled_at?: string | null
          sent_at?: string | null
          sent_count?: number
          status?: string
          target_segment?: string | null
          total_recipients?: number
        }
        Relationships: []
      }
      whatsapp_messages: {
        Row: {
          appointment_id: string | null
          campaign_id: string | null
          created_at: string
          deleted_at: string | null
          deleted_for_everyone: boolean
          delivered_at: string | null
          direction: string
          error: Json | null
          error_code: number | null
          error_message: string | null
          id: string
          is_read: boolean
          lead_id: string | null
          message_kind: string | null
          module: string | null
          patient_id: string | null
          payload: Json | null
          read_at: string | null
          received_at: string
          send_context: Json | null
          sent_at: string | null
          stage_from: string | null
          stage_to: string | null
          status: string | null
          status_updated_at: string | null
          text: string | null
          thread_id: string
          wa_message_id: string | null
          workflow_id: string | null
          workflow_run_id: string | null
        }
        Insert: {
          appointment_id?: string | null
          campaign_id?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_for_everyone?: boolean
          delivered_at?: string | null
          direction: string
          error?: Json | null
          error_code?: number | null
          error_message?: string | null
          id?: string
          is_read?: boolean
          lead_id?: string | null
          message_kind?: string | null
          module?: string | null
          patient_id?: string | null
          payload?: Json | null
          read_at?: string | null
          received_at?: string
          send_context?: Json | null
          sent_at?: string | null
          stage_from?: string | null
          stage_to?: string | null
          status?: string | null
          status_updated_at?: string | null
          text?: string | null
          thread_id: string
          wa_message_id?: string | null
          workflow_id?: string | null
          workflow_run_id?: string | null
        }
        Update: {
          appointment_id?: string | null
          campaign_id?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_for_everyone?: boolean
          delivered_at?: string | null
          direction?: string
          error?: Json | null
          error_code?: number | null
          error_message?: string | null
          id?: string
          is_read?: boolean
          lead_id?: string | null
          message_kind?: string | null
          module?: string | null
          patient_id?: string | null
          payload?: Json | null
          read_at?: string | null
          received_at?: string
          send_context?: Json | null
          sent_at?: string | null
          stage_from?: string | null
          stage_to?: string | null
          status?: string | null
          status_updated_at?: string | null
          text?: string | null
          thread_id?: string
          wa_message_id?: string | null
          workflow_id?: string | null
          workflow_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_pricing_rates: {
        Row: {
          category: string
          created_at: string
          currency: string
          id: string
          rate: number
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          currency?: string
          id?: string
          rate?: number
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          currency?: string
          id?: string
          rate?: number
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_templates: {
        Row: {
          body: string | null
          category: string | null
          created_at: string
          header_media_url: string | null
          id: string
          language: string | null
          name: string
          status: string | null
          updated_at: string
        }
        Insert: {
          body?: string | null
          category?: string | null
          created_at?: string
          header_media_url?: string | null
          id?: string
          language?: string | null
          name: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          body?: string | null
          category?: string | null
          created_at?: string
          header_media_url?: string | null
          id?: string
          language?: string | null
          name?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_threads: {
        Row: {
          created_at: string
          deleted_at: string | null
          display_name: string | null
          id: string
          last_message: string | null
          last_message_at: string | null
          unread_count: number
          updated_at: string
          wa_phone: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          display_name?: string | null
          id?: string
          last_message?: string | null
          last_message_at?: string | null
          unread_count?: number
          updated_at?: string
          wa_phone: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          display_name?: string | null
          id?: string
          last_message?: string | null
          last_message_at?: string | null
          unread_count?: number
          updated_at?: string
          wa_phone?: string
        }
        Relationships: []
      }
      workflow_folders: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      workflow_runs: {
        Row: {
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          id: string
          meta_lead_id: string | null
          status: string
          step: string | null
          workflow_id: string
        }
        Insert: {
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          meta_lead_id?: string | null
          status?: string
          step?: string | null
          workflow_id: string
        }
        Update: {
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          meta_lead_id?: string | null
          status?: string
          step?: string | null
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_runs_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflows: {
        Row: {
          completed: number
          config: Json
          created_at: string
          created_by: string | null
          folder_id: string | null
          id: string
          meta_form_id: string | null
          name: string
          reentry: boolean
          status: boolean
          subtitle: string
          total_contacts: number
          trigger_type: string | null
          updated_at: string
        }
        Insert: {
          completed?: number
          config?: Json
          created_at?: string
          created_by?: string | null
          folder_id?: string | null
          id?: string
          meta_form_id?: string | null
          name?: string
          reentry?: boolean
          status?: boolean
          subtitle?: string
          total_contacts?: number
          trigger_type?: string | null
          updated_at?: string
        }
        Update: {
          completed?: number
          config?: Json
          created_at?: string
          created_by?: string | null
          folder_id?: string | null
          id?: string
          meta_form_id?: string | null
          name?: string
          reentry?: boolean
          status?: boolean
          subtitle?: string
          total_contacts?: number
          trigger_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflows_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "workflow_folders"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      call_logs_unmatched: {
        Row: {
          call_type: string | null
          client_uuid: string | null
          created_at: string | null
          device_id: string | null
          duration_seconds: number | null
          ended_at: string | null
          id: string | null
          normalized_phone: string | null
          notes: string | null
          phone: string | null
          recording_path: string | null
          started_at: string | null
          status: string | null
          telecaller_id: string | null
        }
        Insert: {
          call_type?: string | null
          client_uuid?: string | null
          created_at?: string | null
          device_id?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string | null
          normalized_phone?: string | null
          notes?: string | null
          phone?: string | null
          recording_path?: string | null
          started_at?: string | null
          status?: string | null
          telecaller_id?: string | null
        }
        Update: {
          call_type?: string | null
          client_uuid?: string | null
          created_at?: string | null
          device_id?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string | null
          normalized_phone?: string | null
          notes?: string | null
          phone?: string | null
          recording_path?: string | null
          started_at?: string | null
          status?: string | null
          telecaller_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_logs_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "call_recording_devices"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      apply_purchase_item_stock: {
        Args: { _apply: boolean; _item_id: string }
        Returns: undefined
      }
      build_billing_payment_dedupe_key: {
        Args: {
          _amount: number
          _billing_id: string
          _notes: string
          _payment_date: string
          _payment_method: string
        }
        Returns: string
      }
      camp_public_info: {
        Args: { p_campaign_id: string }
        Returns: {
          camp_code: string
          campaign_type: string
          name: string
          qr_enabled: boolean
        }[]
      }
      camp_self_register: {
        Args: {
          p_age?: number
          p_campaign_id: string
          p_dental_concern?: string
          p_email?: string
          p_gender?: string
          p_mobile: string
          p_participant_name: string
        }
        Returns: string
      }
      can_register_patient: { Args: { _user_id: string }; Returns: boolean }
      current_employee_id: { Args: never; Returns: string }
      deduct_inventory_for_bill: {
        Args: { _billing_id: string }
        Returns: undefined
      }
      has_module_perm: {
        Args: { _action: string; _path: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_workflow_contacts_for_form: {
        Args: {
          p_contact_name?: string
          p_contact_phone?: string
          p_form_id: string
          p_meta_lead_id?: string
          p_step?: string
        }
        Returns: number
      }
      is_billing_user: { Args: { _user_id: string }; Returns: boolean }
      is_cash_drawer_user: { Args: { _user_id: string }; Returns: boolean }
      is_clinical_user: { Args: { _user_id: string }; Returns: boolean }
      is_finance_user: { Args: { _user_id: string }; Returns: boolean }
      is_hr_or_admin: { Args: { _user_id: string }; Returns: boolean }
      is_marketing_admin: { Args: { _user_id: string }; Returns: boolean }
      is_sales_user: { Args: { _user_id: string }; Returns: boolean }
      normalize_phone_last10: { Args: { _phone: string }; Returns: string }
      purge_old_callyzer_webhook_logs: { Args: never; Returns: undefined }
      recompute_fy_actuals: {
        Args: { p_branch_id: string; p_financial_year: string; p_month: number }
        Returns: undefined
      }
      recompute_referral_revenue: {
        Args: { _patient_id: string }
        Returns: undefined
      }
      restock_inventory_for_bill: {
        Args: { _billing_id: string }
        Returns: undefined
      }
      whatsapp_send_breakdown: {
        Args: { _from: string; _to: string }
        Returns: {
          campaign_id: string
          campaign_name: string
          category: string
          delivered: number
          direct_attributed: number
          failed: number
          log_matched: number
          message_kind: string
          module: string
          name_matched: boolean
          raw_source: string
          source_kind: string
          stage_to: string
          template_name: string
          total: number
          unique_appointments: number
          unique_leads: number
          unique_recipients: number
          workflow_id: string
          workflow_name: string
        }[]
      }
      whatsapp_send_duplicates: {
        Args: { _from: string; _to: string }
        Returns: {
          message_count: number
          recipient: string
          ref_id: string
          scope: string
        }[]
      }
      whatsapp_send_messages: {
        Args: {
          _campaign: string
          _category: string
          _from: string
          _kind: string
          _limit?: number
          _module: string
          _offset?: number
          _stage: string
          _template: string
          _to: string
          _workflow: string
        }
        Returns: {
          created_at: string
          error_code: number
          error_message: string
          id: string
          name_matched: boolean
          recipient: string
          recipient_name: string
          status: string
          text: string
          total_count: number
        }[]
      }
      whatsapp_template_duplicate_recipients: {
        Args: {
          _campaign?: string
          _from: string
          _module?: string
          _template?: string
          _to: string
          _workflow?: string
        }
        Returns: {
          first_at: string
          last_at: string
          message_count: number
          recipient: string
        }[]
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "digital_marketing_manager"
        | "digital_marketing_executive"
        | "video_editor"
        | "telecaller"
        | "duty_doctor"
        | "dental_assistant"
        | "receptionist"
        | "hr"
        | "finance_manager"
        | "dre"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "admin",
        "digital_marketing_manager",
        "digital_marketing_executive",
        "video_editor",
        "telecaller",
        "duty_doctor",
        "dental_assistant",
        "receptionist",
        "hr",
        "finance_manager",
        "dre",
      ],
    },
  },
} as const
