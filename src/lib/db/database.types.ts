export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      assistant_chat_shares: {
        Row: {
          chat_id: string | null
          created_at: string
          id: string
          snapshot: NonNullable<Json>
          title: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          chat_id?: string | null
          created_at?: string
          id?: string
          snapshot: NonNullable<Json>
          title?: string
          user_id?: string
        }
        Update: {
          chat_id?: string | null
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
      calculations: {
        Row: {
          computed_at: string
          id: string
          inputs: NonNullable<Json>
          key: string
          limitations: string[]
          method: string
          parameters: NonNullable<Json>
          updated_at: string
          version: string
        }
        ComputedFields: never
        Insert: {
          computed_at?: string
          id?: string
          inputs?: NonNullable<Json>
          key: string
          limitations?: string[]
          method: string
          parameters?: NonNullable<Json>
          updated_at?: string
          version: string
        }
        Update: {
          computed_at?: string
          id?: string
          inputs?: NonNullable<Json>
          key?: string
          limitations?: string[]
          method?: string
          parameters?: NonNullable<Json>
          updated_at?: string
          version?: string
        }
        Relationships: []
      }
      claim_evidence: {
        Row: {
          claim_id: string
          created_at: string
          evidence_id: string
          role: string | null
        }
        ComputedFields: never
        Insert: {
          claim_id: string
          created_at?: string
          evidence_id: string
          role?: string | null
        }
        Update: {
          claim_id?: string
          created_at?: string
          evidence_id?: string
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'claim_evidence_claim_id_fkey'
            columns: ['claim_id']
            isOneToOne: false
            referencedRelation: 'claims'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'claim_evidence_evidence_id_fkey'
            columns: ['evidence_id']
            isOneToOne: false
            referencedRelation: 'evidence'
            referencedColumns: ['id']
          },
        ]
      }
      claims: {
        Row: {
          calculation_id: string | null
          confidence: number | null
          created_at: string
          entity_id: string
          epistemic_status: string
          id: string
          is_demo: boolean
          limitations: string[]
          method: NonNullable<Json>
          observed_at: string | null
          property: string
          source_key: string
          unit: string | null
          updated_at: string
          valid_from: string | null
          valid_to: string | null
          value_boolean: boolean | null
          value_json: Json | null
          value_max: number | null
          value_min: number | null
          value_numeric: number | null
          value_text: string | null
        }
        ComputedFields: never
        Insert: {
          calculation_id?: string | null
          confidence?: number | null
          created_at?: string
          entity_id: string
          epistemic_status: string
          id?: string
          is_demo?: boolean
          limitations?: string[]
          method?: NonNullable<Json>
          observed_at?: string | null
          property: string
          source_key?: string
          unit?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
          value_boolean?: boolean | null
          value_json?: Json | null
          value_max?: number | null
          value_min?: number | null
          value_numeric?: number | null
          value_text?: string | null
        }
        Update: {
          calculation_id?: string | null
          confidence?: number | null
          created_at?: string
          entity_id?: string
          epistemic_status?: string
          id?: string
          is_demo?: boolean
          limitations?: string[]
          method?: NonNullable<Json>
          observed_at?: string | null
          property?: string
          source_key?: string
          unit?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
          value_boolean?: boolean | null
          value_json?: Json | null
          value_max?: number | null
          value_min?: number | null
          value_numeric?: number | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'claims_calculation_id_fkey'
            columns: ['calculation_id']
            isOneToOne: false
            referencedRelation: 'calculations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'claims_entity_id_fkey'
            columns: ['entity_id']
            isOneToOne: false
            referencedRelation: 'entities'
            referencedColumns: ['id']
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
      document_chunks: {
        Row: {
          content_hash: string | null
          created_at: string
          document_id: string
          embedding: unknown
          fts: unknown
          id: string
          metadata: NonNullable<Json>
          ord: number
          text: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          content_hash?: string | null
          created_at?: string
          document_id: string
          embedding?: unknown
          fts?: never
          id?: string
          metadata?: NonNullable<Json>
          ord: number
          text: string
          updated_at?: string
        }
        Update: {
          content_hash?: string | null
          created_at?: string
          document_id?: string
          embedding?: unknown
          fts?: never
          id?: string
          metadata?: NonNullable<Json>
          ord?: number
          text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'document_chunks_document_id_fkey'
            columns: ['document_id']
            isOneToOne: false
            referencedRelation: 'documents'
            referencedColumns: ['id']
          },
        ]
      }
      documents: {
        Row: {
          created_at: string
          entity_id: string | null
          evidence_id: string
          hotel_id: string | null
          id: string
          kind: string
          language: string | null
          metadata: NonNullable<Json>
          text: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          entity_id?: string | null
          evidence_id: string
          hotel_id?: string | null
          id?: string
          kind: string
          language?: string | null
          metadata?: NonNullable<Json>
          text: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          evidence_id?: string
          hotel_id?: string | null
          id?: string
          kind?: string
          language?: string | null
          metadata?: NonNullable<Json>
          text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'documents_entity_id_fkey'
            columns: ['entity_id']
            isOneToOne: false
            referencedRelation: 'entities'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'documents_evidence_id_fkey'
            columns: ['evidence_id']
            isOneToOne: true
            referencedRelation: 'evidence'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'documents_hotel_id_fkey'
            columns: ['hotel_id']
            isOneToOne: false
            referencedRelation: 'hotels'
            referencedColumns: ['id']
          },
        ]
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
      entities: {
        Row: {
          created_at: string
          hotel_id: string | null
          id: string
          kind: string
          metadata: Json
          name: string | null
          ref: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          hotel_id?: string | null
          id?: string
          kind: string
          metadata?: Json
          name?: string | null
          ref: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          hotel_id?: string | null
          id?: string
          kind?: string
          metadata?: Json
          name?: string | null
          ref?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'entities_hotel_id_fkey'
            columns: ['hotel_id']
            isOneToOne: false
            referencedRelation: 'hotels'
            referencedColumns: ['id']
          },
        ]
      }
      evidence: {
        Row: {
          created_at: string
          dataset_id: string | null
          excerpt: string | null
          external_id: string | null
          id: string
          is_demo: boolean
          metadata: NonNullable<Json>
          provider: string
          retrieved_at: string | null
          title: string
          type: string
          updated_at: string
          url: string | null
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          dataset_id?: string | null
          excerpt?: string | null
          external_id?: string | null
          id?: string
          is_demo?: boolean
          metadata?: NonNullable<Json>
          provider: string
          retrieved_at?: string | null
          title: string
          type: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          created_at?: string
          dataset_id?: string | null
          excerpt?: string | null
          external_id?: string | null
          id?: string
          is_demo?: boolean
          metadata?: NonNullable<Json>
          provider?: string
          retrieved_at?: string | null
          title?: string
          type?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'evidence_dataset_id_fkey'
            columns: ['dataset_id']
            isOneToOne: false
            referencedRelation: 'geo_datasets'
            referencedColumns: ['id']
          },
        ]
      }
      geo_buildings: {
        Row: {
          construction_year: number | null
          construction_year_confidence_lower: number | null
          construction_year_confidence_upper: number | null
          construction_year_source: string | null
          construction_year_source_ids: string[] | null
          dataset: string | null
          floors: number | null
          floors_confidence_lower: number | null
          floors_confidence_upper: number | null
          floors_source: string | null
          floors_source_ids: string[] | null
          geom: unknown
          geometry_source: string | null
          geometry_source_id: string | null
          height: number | null
          height_confidence_lower: number | null
          height_confidence_upper: number | null
          height_source: string | null
          height_source_ids: string[] | null
          id: string
          made_valid: boolean
          region_id: string | null
          subtype: string | null
          subtype_confidence: number | null
          subtype_raw: string | null
          subtype_source: string | null
          subtype_source_ids: string[] | null
          type: string | null
          type_confidence: number | null
          type_source: string | null
          type_source_ids: string[] | null
        }
        ComputedFields: never
        Insert: {
          construction_year?: number | null
          construction_year_confidence_lower?: number | null
          construction_year_confidence_upper?: number | null
          construction_year_source?: string | null
          construction_year_source_ids?: string[] | null
          dataset?: string | null
          floors?: number | null
          floors_confidence_lower?: number | null
          floors_confidence_upper?: number | null
          floors_source?: string | null
          floors_source_ids?: string[] | null
          geom: unknown
          geometry_source?: string | null
          geometry_source_id?: string | null
          height?: number | null
          height_confidence_lower?: number | null
          height_confidence_upper?: number | null
          height_source?: string | null
          height_source_ids?: string[] | null
          id: string
          made_valid?: boolean
          region_id?: string | null
          subtype?: string | null
          subtype_confidence?: number | null
          subtype_raw?: string | null
          subtype_source?: string | null
          subtype_source_ids?: string[] | null
          type?: string | null
          type_confidence?: number | null
          type_source?: string | null
          type_source_ids?: string[] | null
        }
        Update: {
          construction_year?: number | null
          construction_year_confidence_lower?: number | null
          construction_year_confidence_upper?: number | null
          construction_year_source?: string | null
          construction_year_source_ids?: string[] | null
          dataset?: string | null
          floors?: number | null
          floors_confidence_lower?: number | null
          floors_confidence_upper?: number | null
          floors_source?: string | null
          floors_source_ids?: string[] | null
          geom?: unknown
          geometry_source?: string | null
          geometry_source_id?: string | null
          height?: number | null
          height_confidence_lower?: number | null
          height_confidence_upper?: number | null
          height_source?: string | null
          height_source_ids?: string[] | null
          id?: string
          made_valid?: boolean
          region_id?: string | null
          subtype?: string | null
          subtype_confidence?: number | null
          subtype_raw?: string | null
          subtype_source?: string | null
          subtype_source_ids?: string[] | null
          type?: string | null
          type_confidence?: number | null
          type_source?: string | null
          type_source_ids?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: 'geo_buildings_dataset_fkey'
            columns: ['dataset']
            isOneToOne: false
            referencedRelation: 'geo_datasets'
            referencedColumns: ['id']
          },
        ]
      }
      geo_coverage: {
        Row: {
          covered: unknown
          dataset: string
          loaded_at: string
          name: string
          source: string
          uncovered: unknown
        }
        ComputedFields: never
        Insert: {
          covered: unknown
          dataset: string
          loaded_at?: string
          name: string
          source: string
          uncovered: unknown
        }
        Update: {
          covered?: unknown
          dataset?: string
          loaded_at?: string
          name?: string
          source?: string
          uncovered?: unknown
        }
        Relationships: [
          {
            foreignKeyName: 'geo_coverage_dataset_fkey'
            columns: ['dataset']
            isOneToOne: true
            referencedRelation: 'geo_datasets'
            referencedColumns: ['id']
          },
        ]
      }
      geo_datasets: {
        Row: {
          extract: string
          id: string
          loaded_at: string
          name: string
          processing: string
          url: string
          version: string
        }
        ComputedFields: never
        Insert: {
          extract: string
          id: string
          loaded_at?: string
          name: string
          processing: string
          url: string
          version: string
        }
        Update: {
          extract?: string
          id?: string
          loaded_at?: string
          name?: string
          processing?: string
          url?: string
          version?: string
        }
        Relationships: []
      }
      geo_noise: {
        Row: {
          band_db: number | null
          category: string
          dataset: string | null
          db_max: number | null
          db_min: number | null
          geom: unknown
          geom_correction: boolean | null
          geometry_error_description: string | null
          id: number
          indicator: string
          made_valid: boolean
          reportnet_file_id: number | null
          source: string
          source_feature_id: number | null
          source_identifier: string | null
        }
        ComputedFields: never
        Insert: {
          band_db?: never
          category: string
          dataset?: string | null
          db_max?: number | null
          db_min?: number | null
          geom: unknown
          geom_correction?: boolean | null
          geometry_error_description?: string | null
          id?: never
          indicator: string
          made_valid?: boolean
          reportnet_file_id?: number | null
          source: string
          source_feature_id?: number | null
          source_identifier?: string | null
        }
        Update: {
          band_db?: never
          category?: string
          dataset?: string | null
          db_max?: number | null
          db_min?: number | null
          geom?: unknown
          geom_correction?: boolean | null
          geometry_error_description?: string | null
          id?: never
          indicator?: string
          made_valid?: boolean
          reportnet_file_id?: number | null
          source?: string
          source_feature_id?: number | null
          source_identifier?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'geo_noise_dataset_fkey'
            columns: ['dataset']
            isOneToOne: false
            referencedRelation: 'geo_datasets'
            referencedColumns: ['id']
          },
        ]
      }
      hotel_features: {
        Row: {
          building_dataset: string | null
          building_id: string | null
          floors: number | null
          floors_lower: number | null
          floors_source: string | null
          floors_upper: number | null
          geometry_source: string | null
          height_lower_m: number | null
          height_m: number | null
          height_source: string | null
          height_upper_m: number | null
          hotel_id: string
          lden_max: number | null
          lden_min: number | null
          lden_source: string | null
          lnight_max: number | null
          lnight_min: number | null
          lnight_source: string | null
          noise_dataset: string | null
          noise_method: string | null
          noise_facade: Json | null
          noise_zone: string | null
          street_lday_max: number | null
          street_lday_min: number | null
          street_lnight_max: number | null
          street_lnight_min: number | null
          updated_at: string
          yard_lday_max: number | null
          yard_lday_min: number | null
          yard_lnight_max: number | null
          yard_lnight_min: number | null
        }
        ComputedFields: never
        Insert: {
          building_dataset?: string | null
          building_id?: string | null
          floors?: number | null
          floors_lower?: number | null
          floors_source?: string | null
          floors_upper?: number | null
          geometry_source?: string | null
          height_lower_m?: number | null
          height_m?: number | null
          height_source?: string | null
          height_upper_m?: number | null
          hotel_id: string
          lden_max?: number | null
          lden_min?: number | null
          lden_source?: string | null
          lnight_max?: number | null
          lnight_min?: number | null
          lnight_source?: string | null
          noise_dataset?: string | null
          noise_method?: string | null
          noise_facade?: Json | null
          noise_zone?: string | null
          street_lday_max?: number | null
          street_lday_min?: number | null
          street_lnight_max?: number | null
          street_lnight_min?: number | null
          updated_at?: string
          yard_lday_max?: number | null
          yard_lday_min?: number | null
          yard_lnight_max?: number | null
          yard_lnight_min?: number | null
        }
        Update: {
          building_dataset?: string | null
          building_id?: string | null
          floors?: number | null
          floors_lower?: number | null
          floors_source?: string | null
          floors_upper?: number | null
          geometry_source?: string | null
          height_lower_m?: number | null
          height_m?: number | null
          height_source?: string | null
          height_upper_m?: number | null
          hotel_id?: string
          lden_max?: number | null
          lden_min?: number | null
          lden_source?: string | null
          lnight_max?: number | null
          lnight_min?: number | null
          lnight_source?: string | null
          noise_dataset?: string | null
          noise_method?: string | null
          noise_facade?: Json | null
          noise_zone?: string | null
          street_lday_max?: number | null
          street_lday_min?: number | null
          street_lnight_max?: number | null
          street_lnight_min?: number | null
          updated_at?: string
          yard_lday_max?: number | null
          yard_lday_min?: number | null
          yard_lnight_max?: number | null
          yard_lnight_min?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'hotel_features_building_dataset_fkey'
            columns: ['building_dataset']
            isOneToOne: false
            referencedRelation: 'geo_datasets'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'hotel_features_hotel_id_fkey'
            columns: ['hotel_id']
            isOneToOne: true
            referencedRelation: 'hotels'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'hotel_features_noise_dataset_fkey'
            columns: ['noise_dataset']
            isOneToOne: false
            referencedRelation: 'geo_datasets'
            referencedColumns: ['id']
          },
        ]
      }
      hotel_noise_maps: {
        Row: {
          computed_at: string
          contours: NonNullable<Json>
          day: NonNullable<Json>
          lat: number
          lon: number
          quiet: NonNullable<Json>
          radius_m: number
        }
        ComputedFields: never
        Insert: {
          computed_at?: string
          contours: NonNullable<Json>
          day: NonNullable<Json>
          lat: number
          lon: number
          quiet: NonNullable<Json>
          radius_m: number
        }
        Update: {
          computed_at?: string
          contours?: NonNullable<Json>
          day?: NonNullable<Json>
          lat?: number
          lon?: number
          quiet?: NonNullable<Json>
          radius_m?: number
        }
        Relationships: []
      }
      hotel_photo_embeddings: {
        Row: {
          content_hash: string
          destination_id: string
          embedding: unknown
          hotel_id: string
          photo_key: string
          updated_at: string
        }
        Insert: {
          content_hash: string
          destination_id: string
          embedding: unknown
          hotel_id: string
          photo_key: string
          updated_at?: string
        }
        Update: {
          content_hash?: string
          destination_id?: string
          embedding?: unknown
          hotel_id?: string
          photo_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'hotel_photo_embeddings_destination_id_fkey'
            columns: ['destination_id']
            isOneToOne: false
            referencedRelation: 'destinations'
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
      hotelier_conversations: {
        Row: {
          created_at: string
          hotel_id: string
          hotelier_unread: number
          id: string
          is_demo: boolean
          kind: string
          last_message_at: string
          last_message_text: string
          last_sender: string | null
          origin_chat_id: string | null
          origin_tool_run_id: string | null
          status: string
          updated_at: string
          user_id: string
          user_hidden_at: string | null
          user_unread: number
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          hotel_id: string
          hotelier_unread?: number
          id?: string
          is_demo?: boolean
          kind?: string
          last_message_at?: string
          last_message_text?: string
          last_sender?: string | null
          origin_chat_id?: string | null
          origin_tool_run_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          user_hidden_at?: string | null
          user_unread?: number
        }
        Update: {
          created_at?: string
          hotel_id?: string
          hotelier_unread?: number
          id?: string
          is_demo?: boolean
          kind?: string
          last_message_at?: string
          last_message_text?: string
          last_sender?: string | null
          origin_chat_id?: string | null
          origin_tool_run_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          user_hidden_at?: string | null
          user_unread?: number
        }
        Relationships: [
          {
            foreignKeyName: 'hotelier_conversations_hotel_id_fkey'
            columns: ['hotel_id']
            isOneToOne: false
            referencedRelation: 'hotels'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'hotelier_conversations_origin_chat_id_user_id_fkey'
            columns: ['origin_chat_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'assistant_chats'
            referencedColumns: ['id', 'user_id']
          },
          {
            foreignKeyName: 'hotelier_conversations_origin_tool_run_id_user_id_fkey'
            columns: ['origin_tool_run_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'tool_runs'
            referencedColumns: ['id', 'user_id']
          },
        ]
      }
      hotelier_hotel_access: {
        Row: {
          created_at: string
          hotel_id: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          hotel_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          hotel_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'hotelier_hotel_access_hotel_id_fkey'
            columns: ['hotel_id']
            isOneToOne: false
            referencedRelation: 'hotels'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'hotelier_hotel_access_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'hotelier_profiles'
            referencedColumns: ['user_id']
          },
        ]
      }
      hotelier_messages: {
        Row: {
          author_id: string | null
          conversation_id: string
          created_at: string
          data: NonNullable<Json>
          id: string
          is_demo: boolean
          knowledge_attempts: number
          knowledge_due_at: string | null
          knowledge_revoked_at: string | null
          read_at: string | null
          request_id: string | null
          sender: string
          shareable: boolean
          text: string
        }
        ComputedFields: never
        Insert: {
          author_id?: string | null
          conversation_id: string
          created_at?: string
          data?: NonNullable<Json>
          id?: string
          is_demo?: boolean
          knowledge_attempts?: number
          knowledge_due_at?: string | null
          knowledge_revoked_at?: string | null
          read_at?: string | null
          request_id?: string | null
          sender: string
          shareable?: boolean
          text: string
        }
        Update: {
          author_id?: string | null
          conversation_id?: string
          created_at?: string
          data?: NonNullable<Json>
          id?: string
          is_demo?: boolean
          knowledge_attempts?: number
          knowledge_due_at?: string | null
          knowledge_revoked_at?: string | null
          read_at?: string | null
          request_id?: string | null
          sender?: string
          shareable?: boolean
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: 'hotelier_messages_conversation_id_fkey'
            columns: ['conversation_id']
            isOneToOne: false
            referencedRelation: 'hotelier_conversations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'hotelier_messages_request_id_fkey'
            columns: ['request_id']
            isOneToOne: false
            referencedRelation: 'hotelier_requests'
            referencedColumns: ['id']
          },
        ]
      }
      hotelier_profiles: {
        Row: {
          all_hotels: boolean
          created_at: string
          display_name: string
          is_demo: boolean
          updated_at: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          all_hotels?: boolean
          created_at?: string
          display_name?: string
          is_demo?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          all_hotels?: boolean
          created_at?: string
          display_name?: string
          is_demo?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      hotelier_requests: {
        Row: {
          answer_message_id: string | null
          answered_at: string | null
          characteristic_keys: string[]
          context_summary: string | null
          conversation_id: string
          created_at: string
          dedupe_key: string
          expires_at: string | null
          hotel_id: string
          id: string
          knowledge_status: string
          origin_chat_id: string | null
          origin_tool_run_id: string | null
          question: string
          room_entity_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          answer_message_id?: string | null
          answered_at?: string | null
          characteristic_keys?: string[]
          context_summary?: string | null
          conversation_id: string
          created_at?: string
          dedupe_key: string
          expires_at?: string | null
          hotel_id: string
          id?: string
          knowledge_status?: string
          origin_chat_id?: string | null
          origin_tool_run_id?: string | null
          question: string
          room_entity_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          answer_message_id?: string | null
          answered_at?: string | null
          characteristic_keys?: string[]
          context_summary?: string | null
          conversation_id?: string
          created_at?: string
          dedupe_key?: string
          expires_at?: string | null
          hotel_id?: string
          id?: string
          knowledge_status?: string
          origin_chat_id?: string | null
          origin_tool_run_id?: string | null
          question?: string
          room_entity_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'hotelier_requests_answer_message_id_fkey'
            columns: ['answer_message_id']
            isOneToOne: false
            referencedRelation: 'hotelier_messages'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'hotelier_requests_conversation_id_user_id_fkey'
            columns: ['conversation_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'hotelier_conversations'
            referencedColumns: ['id', 'user_id']
          },
          {
            foreignKeyName: 'hotelier_requests_hotel_id_fkey'
            columns: ['hotel_id']
            isOneToOne: false
            referencedRelation: 'hotels'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'hotelier_requests_origin_chat_id_user_id_fkey'
            columns: ['origin_chat_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'assistant_chats'
            referencedColumns: ['id', 'user_id']
          },
          {
            foreignKeyName: 'hotelier_requests_origin_tool_run_id_user_id_fkey'
            columns: ['origin_tool_run_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'tool_runs'
            referencedColumns: ['id', 'user_id']
          },
          {
            foreignKeyName: 'hotelier_requests_room_entity_id_fkey'
            columns: ['room_entity_id']
            isOneToOne: false
            referencedRelation: 'entities'
            referencedColumns: ['id']
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
          wifi_mbps: number | null
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
          wifi_mbps?: number | null
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
          wifi_mbps?: number | null
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
      osm_place_areas: {
        Row: {
          area: unknown
          categories: string[]
          id: number
          loaded_at: string
          origin: string
        }
        ComputedFields: never
        Insert: {
          area: unknown
          categories: string[]
          id?: never
          loaded_at?: string
          origin: string
        }
        Update: {
          area?: unknown
          categories?: string[]
          id?: never
          loaded_at?: string
          origin?: string
        }
        Relationships: []
      }
      osm_places: {
        Row: {
          attribution: string
          categories: string[]
          fetched_at: string
          geom: unknown
          lat: number
          lon: number
          name: string | null
          origin: string
          osm_id: number
          osm_type: string
          tags: NonNullable<Json>
        }
        ComputedFields: never
        Insert: {
          attribution?: string
          categories: string[]
          fetched_at?: string
          geom: unknown
          lat: number
          lon: number
          name?: string | null
          origin: string
          osm_id: number
          osm_type: string
          tags?: NonNullable<Json>
        }
        Update: {
          attribution?: string
          categories?: string[]
          fetched_at?: string
          geom?: unknown
          lat?: number
          lon?: number
          name?: string | null
          origin?: string
          osm_id?: number
          osm_type?: string
          tags?: NonNullable<Json>
        }
        Relationships: []
      }
      ota_hotel_pages: {
        Row: {
          hotel: NonNullable<Json>
          master_id: number
          reviews: NonNullable<Json>
          updated_at: string
          url: string | null
        }
        ComputedFields: never
        Insert: {
          hotel: NonNullable<Json>
          master_id: number
          reviews?: NonNullable<Json>
          updated_at?: string
          url?: string | null
        }
        Update: {
          hotel?: NonNullable<Json>
          master_id?: number
          reviews?: NonNullable<Json>
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'ota_hotel_pages_master_id_fkey'
            columns: ['master_id']
            isOneToOne: true
            referencedRelation: 'ota_hotels'
            referencedColumns: ['master_id']
          },
        ]
      }
      ota_hotel_pois: {
        Row: {
          distance_m: number
          is_nearby: boolean
          is_top_poi: boolean
          is_transport_hub: boolean
          master_id: number
          region_id: number
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          distance_m: number
          is_nearby: boolean
          is_top_poi: boolean
          is_transport_hub: boolean
          master_id: number
          region_id: number
          updated_at?: string
        }
        Update: {
          distance_m?: number
          is_nearby?: boolean
          is_top_poi?: boolean
          is_transport_hub?: boolean
          master_id?: number
          region_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'ota_hotel_pois_master_id_fkey'
            columns: ['master_id']
            isOneToOne: false
            referencedRelation: 'ota_hotels'
            referencedColumns: ['master_id']
          },
          {
            foreignKeyName: 'ota_hotel_pois_region_id_fkey'
            columns: ['region_id']
            isOneToOne: false
            referencedRelation: 'ota_hotel_places'
            referencedColumns: ['region_id']
          },
          {
            foreignKeyName: 'ota_hotel_pois_region_id_fkey'
            columns: ['region_id']
            isOneToOne: false
            referencedRelation: 'ota_pois'
            referencedColumns: ['region_id']
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
      ota_pois: {
        Row: {
          catalog_slug: string | null
          genitive: string | null
          geom: unknown
          locative_in: string | null
          name: string
          name_en: string
          region_id: number
          subtype: string
          type: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          catalog_slug?: string | null
          genitive?: string | null
          geom: unknown
          locative_in?: string | null
          name: string
          name_en: string
          region_id: number
          subtype: string
          type: string
          updated_at?: string
        }
        Update: {
          catalog_slug?: string | null
          genitive?: string | null
          geom?: unknown
          locative_in?: string | null
          name?: string
          name_en?: string
          region_id?: number
          subtype?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      ota_rate_spec_tags: {
        Row: {
          adj_kind: string
          name: string
          priority: number
          translation: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          adj_kind: string
          name: string
          priority: number
          translation: string
          updated_at?: string
        }
        Update: {
          adj_kind?: string
          name?: string
          priority?: number
          translation?: string
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
      relations: {
        Row: {
          claim_id: string | null
          confidence: number | null
          created_at: string
          evidence_id: string | null
          id: string
          object_id: string
          predicate: string
          subject_id: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          claim_id?: string | null
          confidence?: number | null
          created_at?: string
          evidence_id?: string | null
          id?: string
          object_id: string
          predicate: string
          subject_id: string
          updated_at?: string
        }
        Update: {
          claim_id?: string | null
          confidence?: number | null
          created_at?: string
          evidence_id?: string | null
          id?: string
          object_id?: string
          predicate?: string
          subject_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'relations_claim_id_fkey'
            columns: ['claim_id']
            isOneToOne: false
            referencedRelation: 'claims'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'relations_evidence_id_fkey'
            columns: ['evidence_id']
            isOneToOne: false
            referencedRelation: 'evidence'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'relations_object_id_fkey'
            columns: ['object_id']
            isOneToOne: false
            referencedRelation: 'entities'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'relations_subject_id_fkey'
            columns: ['subject_id']
            isOneToOne: false
            referencedRelation: 'entities'
            referencedColumns: ['id']
          },
        ]
      }
      tool_run_evidence: {
        Row: {
          evidence_id: string
          tool_run_id: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          evidence_id: string
          tool_run_id: string
          user_id?: string
        }
        Update: {
          evidence_id?: string
          tool_run_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'tool_run_evidence_evidence_id_fkey'
            columns: ['evidence_id']
            isOneToOne: false
            referencedRelation: 'evidence'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'tool_run_evidence_tool_run_id_user_id_fkey'
            columns: ['tool_run_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'tool_runs'
            referencedColumns: ['id', 'user_id']
          },
        ]
      }
      tool_runs: {
        Row: {
          chat_id: string
          completed_at: string | null
          error: Json | null
          id: string
          input_summary: string
          message_id: string | null
          result_data: Json | null
          result_summary: string
          resume: Json | null
          started_at: string
          status: string
          tool_name: string
          updated_at: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          chat_id: string
          completed_at?: string | null
          error?: Json | null
          id?: string
          input_summary?: string
          message_id?: string | null
          result_data?: Json | null
          result_summary?: string
          resume?: Json | null
          started_at?: string
          status?: string
          tool_name: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          chat_id?: string
          completed_at?: string | null
          error?: Json | null
          id?: string
          input_summary?: string
          message_id?: string | null
          result_data?: Json | null
          result_summary?: string
          resume?: Json | null
          started_at?: string
          status?: string
          tool_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'tool_runs_chat_id_user_id_fkey'
            columns: ['chat_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'assistant_chats'
            referencedColumns: ['id', 'user_id']
          },
        ]
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
      ota_hotel_places: {
        Row: {
          bearing_deg: number | null
          distance_m: number | null
          hotel_id: string | null
          is_nearby: boolean | null
          is_top_poi: boolean | null
          is_transport_hub: boolean | null
          lat: number | null
          lon: number | null
          master_id: number | null
          name: string | null
          name_en: string | null
          region_id: number | null
          straight_m: number | null
          subtype: string | null
          type: string | null
        }
        ComputedFields: never
        Relationships: [
          {
            foreignKeyName: 'ota_hotel_pois_master_id_fkey'
            columns: ['master_id']
            isOneToOne: false
            referencedRelation: 'ota_hotels'
            referencedColumns: ['master_id']
          },
        ]
      }
    }
    Functions: {
      answer_hotelier_request: { Args: { message_id: string; request_id: string }; Returns: string[] }
      assistant_chat_share: {
        Args: { share_id: string }
        Returns: {
          created_at: string
          id: string
          snapshot: Json
          title: string
        }[]
      }
      create_hotelier_request: {
        Args: {
          characteristic_keys?: string[]
          context_summary?: string
          hotel_id: string
          origin_chat_id: string
          origin_tool_run_id: string
          question: string
          room_ref?: string
          traveller: string
        }
        Returns: {
          conversation: string
          request: string
          reused: boolean
        }[]
      }
      hotel_chunks_hybrid: {
        Args: { hotel_id: string; max_rows?: number; query: string; query_embedding?: unknown }
        Returns: {
          chunk_id: string
          document_id: string
          evidence_id: string
          fts_place: number
          kind: string
          metadata: Json
          ord: number
          rank: number
          text: string
          vector_place: number
        }[]
      }
      hotel_geo: { Args: { lat: number; lon: number }; Returns: Json }
      hotel_geo_features: { Args: { lat: number; lon: number; radius_m?: number }; Returns: Json }
      hotel_noise_day: { Args: { lat: number; lon: number; radius_m?: number }; Returns: Json }
      hotel_noise_facade: { Args: { lat: number; lon: number }; Returns: Json }
      hotel_noise_map: { Args: { lat: number; lon: number; radius_m?: number }; Returns: Json }
      hotel_noise_map_refresh: { Args: { lat: number; lon: number; radius_m?: number }; Returns: number }
      hotel_noise_maps_prune: { Args: { radius_m?: number }; Returns: number }
      hotel_noise_quiet: { Args: { lat: number; lon: number; radius_m?: number }; Returns: Json }
      hotel_sea_distances: {
        Args: Record<PropertyKey, never>
        Returns: {
          hotel_id: string
          sea_m: number
        }[]
      }
      hotels_chunks_search: {
        Args: { hotel_ids: string[]; per_hotel?: number; query: string; query_embedding?: unknown }
        Returns: {
          chunk_id: string
          document_id: string
          evidence_id: string
          fts_place: number
          hotel_id: string
          kind: string
          metadata: Json
          ord: number
          similarity: number
          text: string
          vector_place: number
        }[]
      }
      hotel_view_eyes: { Args: { lat: number; lon: number; targets: Json }; Returns: Json }
      hotelier_conversation_read: { Args: { conversation_id: string }; Returns: undefined }
      hotelier_conversation_status: { Args: { conversation_id: string; status: string }; Returns: boolean }
      hotelier_hide_chat: { Args: { conversation_id: string }; Returns: boolean }
      hotelier_my_chats: {
        Args: Record<PropertyKey, never>
        Returns: {
          created_at: string
          hotel_id: string
          hotelier_unread: number
          id: string
          is_demo: boolean
          kind: string
          last_message_at: string
          last_message_text: string
          last_sender: string | null
          origin_chat_id: string | null
          origin_tool_run_id: string | null
          status: string
          updated_at: string
          user_id: string
          user_hidden_at: string | null
          user_unread: number
        }[]
      }
      hotelier_own_answer: { Args: { message_id: string }; Returns: boolean }
      hotelier_traveller_chat: {
        Args: { hotel_id: string }
        Returns: {
          created_at: string
          hotel_id: string
          hotelier_unread: number
          id: string
          is_demo: boolean
          kind: string
          last_message_at: string
          last_message_text: string
          last_sender: string | null
          origin_chat_id: string | null
          origin_tool_run_id: string | null
          status: string
          updated_at: string
          user_id: string
          user_unread: number
        }[]
      }
      hotels_outside_noise: { Args: Record<PropertyKey, never>; Returns: string[] }
      is_hotelier: { Args: Record<PropertyKey, never>; Returns: boolean }
      is_hotelier_conversation: { Args: { conversation_id: string }; Returns: boolean }
      is_hotelier_of: { Args: { hotel_id: string }; Returns: boolean }
      is_traveller_conversation: { Args: { conversation_id: string }; Returns: boolean }
      match_embeddings: {
        Args: { destination_ids?: string[]; match_count?: number; match_kind: string; query_embedding: unknown }
        Returns: {
          content: string
          destination_id: string
          ref_id: string
          similarity: number
        }[]
      }
      match_hotel_photos: {
        Args: { destination_ids?: string[]; match_count?: number; query_embedding: unknown }
        Returns: {
          destination_id: string
          hotel_id: string
          similarity: number
        }[]
      }
      osm_place_area_add: {
        Args: { categories: string[]; lat: number; lon: number; origin?: string; radius_m: number }
        Returns: undefined
      }
      osm_places_named: { Args: { max_places?: number; q: string }; Returns: Json }
      osm_places_near: {
        Args: { lat: number; lon: number; per_category?: number; radius_m: number; wanted: string[] }
        Returns: Json
      }
      osm_places_near_facade: {
        Args: { lat: number; lon: number; per_category?: number; radius_m: number; wanted: string[] }
        Returns: Json
      }
      rate_limit_hit: { Args: { hit_key: string; hit_limit: number; window_seconds: number }; Returns: boolean }
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
