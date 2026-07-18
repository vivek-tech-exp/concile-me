export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      finding_order_records: {
        Row: {
          created_at: string
          finding_id: string
          import_batch_id: string
          order_record_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          finding_id: string
          import_batch_id: string
          order_record_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          finding_id?: string
          import_batch_id?: string
          order_record_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finding_order_records_finding_fkey"
            columns: ["finding_id", "import_batch_id", "user_id"]
            isOneToOne: false
            referencedRelation: "findings"
            referencedColumns: ["id", "import_batch_id", "user_id"]
          },
          {
            foreignKeyName: "finding_order_records_order_fkey"
            columns: ["order_record_id", "import_batch_id", "user_id"]
            isOneToOne: false
            referencedRelation: "order_records"
            referencedColumns: ["id", "import_batch_id", "user_id"]
          },
        ]
      }
      finding_payment_records: {
        Row: {
          created_at: string
          finding_id: string
          import_batch_id: string
          payment_record_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          finding_id: string
          import_batch_id: string
          payment_record_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          finding_id?: string
          import_batch_id?: string
          payment_record_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finding_payment_records_finding_fkey"
            columns: ["finding_id", "import_batch_id", "user_id"]
            isOneToOne: false
            referencedRelation: "findings"
            referencedColumns: ["id", "import_batch_id", "user_id"]
          },
          {
            foreignKeyName: "finding_payment_records_payment_fkey"
            columns: ["payment_record_id", "import_batch_id", "user_id"]
            isOneToOne: false
            referencedRelation: "payment_records"
            referencedColumns: ["id", "import_batch_id", "user_id"]
          },
        ]
      }
      findings: {
        Row: {
          category: string
          code: string
          created_at: string
          currency: string | null
          financial_impact_minor: number | null
          id: string
          import_batch_id: string
          message: string
          reconciliation_id: string | null
          severity: string
          sort_key: string
          user_id: string
        }
        Insert: {
          category: string
          code: string
          created_at?: string
          currency?: string | null
          financial_impact_minor?: number | null
          id?: string
          import_batch_id: string
          message: string
          reconciliation_id?: string | null
          severity: string
          sort_key: string
          user_id: string
        }
        Update: {
          category?: string
          code?: string
          created_at?: string
          currency?: string | null
          financial_impact_minor?: number | null
          id?: string
          import_batch_id?: string
          message?: string
          reconciliation_id?: string | null
          severity?: string
          sort_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "findings_import_user_fkey"
            columns: ["import_batch_id", "user_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "findings_reconciliation_fkey"
            columns: ["reconciliation_id", "import_batch_id", "user_id"]
            isOneToOne: false
            referencedRelation: "reconciliations"
            referencedColumns: ["id", "import_batch_id", "user_id"]
          },
        ]
      }
      import_batches: {
        Row: {
          created_at: string
          id: string
          idempotency_key: string
          orders_filename: string
          payments_filename: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          idempotency_key: string
          orders_filename: string
          payments_filename: string
          status: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          idempotency_key?: string
          orders_filename?: string
          payments_filename?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      order_records: {
        Row: {
          amount_minor: number
          created_at: string
          id: string
          import_batch_id: string
          normalized_currency: string
          normalized_order_id: string
          normalized_status: string
          order_date: string | null
          original_amount: string
          original_currency: string
          original_order_date: string
          original_order_id: string
          original_status: string
          source_row_number: number
          user_id: string
        }
        Insert: {
          amount_minor: number
          created_at?: string
          id?: string
          import_batch_id: string
          normalized_currency: string
          normalized_order_id: string
          normalized_status: string
          order_date?: string | null
          original_amount: string
          original_currency: string
          original_order_date: string
          original_order_id: string
          original_status: string
          source_row_number: number
          user_id: string
        }
        Update: {
          amount_minor?: number
          created_at?: string
          id?: string
          import_batch_id?: string
          normalized_currency?: string
          normalized_order_id?: string
          normalized_status?: string
          order_date?: string | null
          original_amount?: string
          original_currency?: string
          original_order_date?: string
          original_order_id?: string
          original_status?: string
          source_row_number?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_records_import_user_fkey"
            columns: ["import_batch_id", "user_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      payment_records: {
        Row: {
          amount_minor: number
          created_at: string
          id: string
          import_batch_id: string
          normalized_currency: string
          normalized_order_reference: string
          normalized_payment_id: string
          normalized_status: string
          normalized_type: string
          original_amount: string
          original_currency: string
          original_order_reference: string
          original_payment_id: string
          original_status: string
          original_transaction_date: string
          original_type: string
          source_row_number: number
          transaction_date: string | null
          user_id: string
        }
        Insert: {
          amount_minor: number
          created_at?: string
          id?: string
          import_batch_id: string
          normalized_currency: string
          normalized_order_reference: string
          normalized_payment_id: string
          normalized_status: string
          normalized_type: string
          original_amount: string
          original_currency: string
          original_order_reference: string
          original_payment_id: string
          original_status: string
          original_transaction_date: string
          original_type: string
          source_row_number: number
          transaction_date?: string | null
          user_id: string
        }
        Update: {
          amount_minor?: number
          created_at?: string
          id?: string
          import_batch_id?: string
          normalized_currency?: string
          normalized_order_reference?: string
          normalized_payment_id?: string
          normalized_status?: string
          normalized_type?: string
          original_amount?: string
          original_currency?: string
          original_order_reference?: string
          original_payment_id?: string
          original_status?: string
          original_transaction_date?: string
          original_type?: string
          source_row_number?: number
          transaction_date?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_records_import_user_fkey"
            columns: ["import_batch_id", "user_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      reconciliation_currency_metrics: {
        Row: {
          created_at: string
          currency: string
          disputed_value_minor: number
          id: string
          import_batch_id: string
          money_at_risk_minor: number
          reconciled_value_minor: number
          reconciliation_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          currency: string
          disputed_value_minor: number
          id?: string
          import_batch_id: string
          money_at_risk_minor: number
          reconciled_value_minor: number
          reconciliation_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          disputed_value_minor?: number
          id?: string
          import_batch_id?: string
          money_at_risk_minor?: number
          reconciled_value_minor?: number
          reconciliation_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_currency_metrics_import_user_fkey"
            columns: ["import_batch_id", "user_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "reconciliation_currency_metrics_reconciliation_fkey"
            columns: ["reconciliation_id", "import_batch_id", "user_id"]
            isOneToOne: false
            referencedRelation: "reconciliations"
            referencedColumns: ["id", "import_batch_id", "user_id"]
          },
        ]
      }
      reconciliations: {
        Row: {
          created_at: string
          id: string
          import_batch_id: string
          total_orders: number
          total_payments: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          import_batch_id: string
          total_orders: number
          total_payments: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          import_batch_id?: string
          total_orders?: number
          total_payments?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reconciliations_import_user_fkey"
            columns: ["import_batch_id", "user_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_import_batch: {
        Args: {
          p_idempotency_key: string
          p_orders: Json
          p_orders_filename: string
          p_payments: Json
          p_payments_filename: string
          p_warnings?: Json
        }
        Returns: string
      }
      is_iso_currency: { Args: { p_value: string }; Returns: boolean }
      is_safe_js_bigint: { Args: { p_value: number }; Returns: boolean }
      replace_current_reconciliation: {
        Args: {
          p_currency_metrics: Json
          p_findings: Json
          p_import_batch_id: string
          p_total_orders: number
          p_total_payments: number
        }
        Returns: string
      }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

