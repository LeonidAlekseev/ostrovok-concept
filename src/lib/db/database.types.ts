export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      assistant_chat_shares: {
        Row: {
          created_at: string
          id: string
          snapshot: NonNullable<Json>
          title: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          id?: string
          snapshot: NonNullable<Json>
          title?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          snapshot?: NonNullable<Json>
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      assistant_chats: {
        Row: {
          brief: NonNullable<Json>
          created_at: string
          id: string
          question: Json | null
          title: string
          unread: boolean
          updated_at: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          brief?: NonNullable<Json>
          created_at?: string
          id: string
          question?: Json | null
          title?: string
          unread?: boolean
          updated_at?: string
          user_id?: string
        }
        Update: {
          brief?: NonNullable<Json>
          created_at?: string
          id?: string
          question?: Json | null
          title?: string
          unread?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      assistant_messages: {
        Row: {
          chat_id: string
          created_at: string
          data: NonNullable<Json>
          id: string
          role: string
          status: string
          text: string
          updated_at: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          chat_id: string
          created_at?: string
          data?: NonNullable<Json>
          id: string
          role: string
          status?: string
          text?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          chat_id?: string
          created_at?: string
          data?: NonNullable<Json>
          id?: string
          role?: string
          status?: string
          text?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'assistant_messages_chat_id_user_id_fkey'
            columns: ['chat_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'assistant_chats'
            referencedColumns: ['id', 'user_id']
          },
        ]
      }
      destinations: {
        Row: {
          data: NonNullable<Json>
          id: string
          position: number | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          data: NonNullable<Json>
          id: string
          position?: number | null
          updated_at?: string
        }
        Update: {
          data?: NonNullable<Json>
          id?: string
          position?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      embeddings: {
        Row: {
          content: string
          content_hash: string
          destination_id: string
          embedding: unknown
          kind: string
          model: string
          ref_id: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          content: string
          content_hash: string
          destination_id: string
          embedding: unknown
          kind: string
          model: string
          ref_id: string
          updated_at?: string
        }
        Update: {
          content?: string
          content_hash?: string
          destination_id?: string
          embedding?: unknown
          kind?: string
          model?: string
          ref_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'embeddings_destination_id_fkey'
            columns: ['destination_id']
            isOneToOne: false
            referencedRelation: 'destinations'
            referencedColumns: ['id']
          },
        ]
      }
      geo_buildings: {
        Row: {
          construction_year: number | null
          floors: number | null
          geom: unknown
          height: number | null
          id: string
          subtype: string | null
          type: string | null
        }
        ComputedFields: never
        Insert: {
          construction_year?: number | null
          floors?: number | null
          geom: unknown
          height?: number | null
          id: string
          subtype?: string | null
          type?: string | null
        }
        Update: {
          construction_year?: number | null
          floors?: number | null
          geom?: unknown
          height?: number | null
          id?: string
          subtype?: string | null
          type?: string | null
        }
        Relationships: []
      }
      geo_noise: {
        Row: {
          category: string
          db_max: number | null
          db_min: number | null
          geom: unknown
          id: number
          indicator: string
          source: string
        }
        ComputedFields: never
        Insert: {
          category: string
          db_max?: number | null
          db_min?: number | null
          geom: unknown
          id?: never
          indicator: string
          source: string
        }
        Update: {
          category?: string
          db_max?: number | null
          db_min?: number | null
          geom?: unknown
          id?: never
          indicator?: string
          source?: string
        }
        Relationships: []
      }
      hotel_features: {
        Row: {
          building_id: string | null
          floors: number | null
          height_m: number | null
          hotel_id: string
          lden_max: number | null
          lden_min: number | null
          lden_source: string | null
          lnight_max: number | null
          lnight_min: number | null
          lnight_source: string | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          building_id?: string | null
          floors?: number | null
          height_m?: number | null
          hotel_id: string
          lden_max?: number | null
          lden_min?: number | null
          lden_source?: string | null
          lnight_max?: number | null
          lnight_min?: number | null
          lnight_source?: string | null
          updated_at?: string
        }
        Update: {
          building_id?: string | null
          floors?: number | null
          height_m?: number | null
          hotel_id?: string
          lden_max?: number | null
          lden_min?: number | null
          lden_source?: string | null
          lnight_max?: number | null
          lnight_min?: number | null
          lnight_source?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'hotel_features_hotel_id_fkey'
            columns: ['hotel_id']
            isOneToOne: true
            referencedRelation: 'hotels'
            referencedColumns: ['id']
          },
        ]
      }
      hotel_room_views: {
        Row: {
          hotel_id: string
          master_id: number
          rg_hash: string
          source: string
          updated_at: string
          view: string
        }
        ComputedFields: never
        Insert: {
          hotel_id: string
          master_id: number
          rg_hash: string
          source?: string
          updated_at?: string
          view: string
        }
        Update: {
          hotel_id?: string
          master_id?: number
          rg_hash?: string
          source?: string
          updated_at?: string
          view?: string
        }
        Relationships: [
          {
            foreignKeyName: 'hotel_room_views_hotel_id_fkey'
            columns: ['hotel_id']
            isOneToOne: false
            referencedRelation: 'hotels'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'hotel_room_views_master_id_fkey'
            columns: ['master_id']
            isOneToOne: false
            referencedRelation: 'ota_hotels'
            referencedColumns: ['master_id']
          },
        ]
      }
      hotels: {
        Row: {
          data: NonNullable<Json>
          destination_id: string
          id: string
          lat: number
          lon: number
          position: number | null
          price_from: number
          rating: number
          stars: number
          stay_type: string
          updated_at: string
          wifi_mbps: number
          workspace: boolean
        }
        ComputedFields: never
        Insert: {
          data: NonNullable<Json>
          destination_id: string
          id: string
          lat: number
          lon: number
          position?: number | null
          price_from: number
          rating: number
          stars: number
          stay_type?: string
          updated_at?: string
          wifi_mbps?: number
          workspace?: boolean
        }
        Update: {
          data?: NonNullable<Json>
          destination_id?: string
          id?: string
          lat?: number
          lon?: number
          position?: number | null
          price_from?: number
          rating?: number
          stars?: number
          stay_type?: string
          updated_at?: string
          wifi_mbps?: number
          workspace?: boolean
        }
        Relationships: [
          {
            foreignKeyName: 'hotels_destination_id_fkey'
            columns: ['destination_id']
            isOneToOne: false
            referencedRelation: 'destinations'
            referencedColumns: ['id']
          },
        ]
      }
      ota_hotels: {
        Row: {
          lat: number
          lon: number
          map_hotel: Json | null
          marketing_badges: Json | null
          master_id: number
          name: string
          ota_hotel_id: string
          rates: NonNullable<Json>
          static_vm: NonNullable<Json>
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          lat: number
          lon: number
          map_hotel?: Json | null
          marketing_badges?: Json | null
          master_id: number
          name: string
          ota_hotel_id: string
          rates?: NonNullable<Json>
          static_vm: NonNullable<Json>
          updated_at?: string
        }
        Update: {
          lat?: number
          lon?: number
          map_hotel?: Json | null
          marketing_badges?: Json | null
          master_id?: number
          name?: string
          ota_hotel_id?: string
          rates?: NonNullable<Json>
          static_vm?: NonNullable<Json>
          updated_at?: string
        }
        Relationships: []
      }
      ota_searches: {
        Row: {
          id: string
          payload: NonNullable<Json>
          region_slug: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          id: string
          payload: NonNullable<Json>
          region_slug: string
          updated_at?: string
        }
        Update: {
          id?: string
          payload?: NonNullable<Json>
          region_slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          name: string | null
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          id: string
          name?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string | null
        }
        Relationships: []
      }
      rate_limit_hits: {
        Row: {
          count: number
          key: string
          reset_at: string
        }
        ComputedFields: never
        Insert: {
          count: number
          key: string
          reset_at: string
        }
        Update: {
          count?: number
          key?: string
          reset_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      hotel_room_views_named: {
        Row: {
          hotel_id: string | null
          rg_hash: string | null
          room_name: string | null
          source: string | null
          view: string | null
        }
        ComputedFields: never
        Relationships: [
          {
            foreignKeyName: 'hotel_room_views_hotel_id_fkey'
            columns: ['hotel_id']
            isOneToOne: false
            referencedRelation: 'hotels'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Functions: {
      assistant_chat_share: {
        Args: { share_id: string }
        Returns: {
          created_at: string
          id: string
          snapshot: NonNullable<Json>
          title: string
        }[]
      }
      hotel_geo: { Args: { lat: number; lon: number }; Returns: Json }
      match_embeddings: {
        Args: { destination_ids?: string[]; match_count?: number; match_kind: string; query_embedding: unknown }
        Returns: {
          content: string
          destination_id: string
          ref_id: string
          similarity: number
        }[]
      }
      rate_limit_hit: {
        Args: { hit_key: string; hit_limit: number; window_seconds: number }
        Returns: boolean
      }
      similar_hotels: {
        Args: { hotel_id: string; match_count?: number; profile_ids?: string[] }
        Returns: {
          profile_similarity: number
          ref_id: string
          score: number
          similarity: number
        }[]
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

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    keyof (DefaultSchema['Tables'] & DefaultSchema['Views']) | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
