// Table types derived from supabase/migrations/20261002172027_remote_schema.sql.
// Includes account activations and credential RPCs from migrations through 20261003020000.
// Keep these synchronized with schema migrations; relationships determine query result shapes.
export type Database = {
  public: {
    Tables: {
      product_members: {
        Row: { product_id: number; tool_id: number };
        Insert: { product_id: number; tool_id: number };
        Update: { product_id?: number; tool_id?: number };
        Relationships: [];
      };
      product_downloads: {
        Row: { product_id: number; file_path: string; file_name: string; enabled: boolean; created_at: string };
        Insert: { product_id: number; file_path: string; file_name: string; enabled?: boolean; created_at?: string };
        Update: { product_id?: number; file_path?: string; file_name?: string; enabled?: boolean; created_at?: string };
        Relationships: [{ foreignKeyName: "product_downloads_product_id_fkey"; columns: ["product_id"]; isOneToOne: true; referencedRelation: "products"; referencedColumns: ["id"] }];
      };
      account_activation_credentials: {
        Row: { encrypted_key: string | null; reveal_available: boolean; user_id: string; id: string; secret_hash: string; key_prefix: string; created_at: string; updated_at: string; };
        Insert: { encrypted_key?: string | null; reveal_available?: never; user_id: string; id?: string; secret_hash: string; key_prefix: string; created_at?: string; updated_at?: string; };
        Update: { encrypted_key?: string | null; reveal_available?: never; user_id?: string; id?: string; secret_hash?: string; key_prefix?: string; created_at?: string; updated_at?: string; };
        Relationships: [];
      };
      account_activations: {
        Row: {
          credential_id: string | null;
          id: number; user_id: string; machine_id: string; status: string;
          activated_at: string; released_at: string | null; released_by: string | null;
          created_at: string; updated_at: string;
        };
        Insert: {
          credential_id?: string | null;
          id?: number; user_id: string; machine_id: string; status?: string;
          activated_at?: string; released_at?: string | null; released_by?: string | null;
          created_at?: string; updated_at?: string;
        };
        Update: {
          credential_id?: string | null;
          id?: number; user_id?: string; machine_id?: string; status?: string;
          activated_at?: string; released_at?: string | null; released_by?: string | null;
          created_at?: string; updated_at?: string;
        };
        Relationships: [];
      };
      admin_users: {
        Row: {
          user_id: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          created_at?: string;
        };
        Relationships: [
        ];
      };
      category: {
        Row: {
          id: number;
          created_at: string;
          name: string;
          slug: string;
          sort_order: number;
          active: boolean;
        };
        Insert: {
          id?: number;
          created_at?: string;
          name?: string;
          slug?: string;
          sort_order?: number;
          active?: boolean;
        };
        Update: {
          id?: number;
          created_at?: string;
          name?: string;
          slug?: string;
          sort_order?: number;
          active?: boolean;
        };
        Relationships: [
        ];
      };
      complexity: {
        Row: {
          id: number;
          created_at: string;
          name: string;
          slug: string;
          sort_order: number;
          active: boolean;
        };
        Insert: {
          id?: number;
          created_at?: string;
          name?: string;
          slug?: string;
          sort_order?: number;
          active?: boolean;
        };
        Update: {
          id?: number;
          created_at?: string;
          name?: string;
          slug?: string;
          sort_order?: number;
          active?: boolean;
        };
        Relationships: [
        ];
      };
      entitlements: {
        Row: {
          id: number;
          user_id: string;
          product_id: number;
          order_item_id: number | null;
          source: string;
          status: string;
          granted_at: string;
          revoked_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          user_id: string;
          product_id: number;
          order_item_id?: number | null;
          source?: string;
          status?: string;
          granted_at?: string;
          revoked_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          user_id?: string;
          product_id?: number;
          order_item_id?: number | null;
          source?: string;
          status?: string;
          granted_at?: string;
          revoked_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "entitlements_order_item_id_fkey";
            columns: ["order_item_id"];
            isOneToOne: false;
            referencedRelation: "order_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "entitlements_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      license_activations: {
        Row: {
          id: number;
          entitlement_id: number;
          user_id: string;
          product_id: number;
          machine_id: string;
          status: string;
          activated_at: string;
          released_at: string | null;
          released_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          entitlement_id: number;
          user_id: string;
          product_id: number;
          machine_id: string;
          status?: string;
          activated_at?: string;
          released_at?: string | null;
          released_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          entitlement_id?: number;
          user_id?: string;
          product_id?: number;
          machine_id?: string;
          status?: string;
          activated_at?: string;
          released_at?: string | null;
          released_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "license_activations_entitlement_id_fkey";
            columns: ["entitlement_id"];
            isOneToOne: false;
            referencedRelation: "entitlements";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "license_activations_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      order_items: {
        Row: {
          id: number;
          order_id: number;
          product_id: number;
          quantity: number;
          unit_price: number;
          created_at: string;
        };
        Insert: {
          id?: number;
          order_id: number;
          product_id: number;
          quantity?: number;
          unit_price: number;
          created_at?: string;
        };
        Update: {
          id?: number;
          order_id?: number;
          product_id?: number;
          quantity?: number;
          unit_price?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      orders: {
        Row: {
          id: number;
          order_number: string | null;
          user_id: string;
          provider: string;
          provider_order_id: string | null;
          provider_transaction_id: string | null;
          status: string;
          currency: string;
          subtotal: number;
          total: number;
          provider_created_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          user_id: string;
          provider?: string;
          provider_order_id?: string | null;
          provider_transaction_id?: string | null;
          status?: string;
          currency?: string;
          subtotal?: number;
          total?: number;
          provider_created_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          user_id?: string;
          provider?: string;
          provider_order_id?: string | null;
          provider_transaction_id?: string | null;
          status?: string;
          currency?: string;
          subtotal?: number;
          total?: number;
          provider_created_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
        ];
      };
      product_media: {
        Row: {
          id: number;
          created_at: string;
          product_id: number;
          media_type: string;
          file_path: string | null;
          external_url: string | null;
          role: string;
          sort_order: number;
        };
        Insert: {
          id?: number;
          created_at?: string;
          product_id: number;
          media_type: string;
          file_path?: string | null;
          external_url?: string | null;
          role: string;
          sort_order: number;
        };
        Update: {
          id?: number;
          created_at?: string;
          product_id?: number;
          media_type?: string;
          file_path?: string | null;
          external_url?: string | null;
          role?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "product_media_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      products: {
        Row: {
          product_type: "tool" | "bundle" | "project";
          prepared_identity: import("./preparedTool").ToolIdentity | null;
          draft_request_id: string | null;
          id: number;
          created_at: string;
          name: string;
          slug: string;
          subtitle: string;
          description: string;
          price_eur: number | null;
          compatibility: string;
          current_version: string;
          release_date: string | null;
          initial_release_date: string | null;
          published: boolean;
          also_included_in_text: string | null;
          updated_at: string;
          category_id: number | null;
          complexity_id: number | null;
        };
        Insert: {
          product_type?: "tool" | "bundle" | "project";
          prepared_identity?: import("./preparedTool").ToolIdentity | null;
          draft_request_id?: string | null;
          id?: number;
          created_at?: string;
          name?: string;
          slug?: string;
          subtitle?: string;
          description?: string;
          price_eur: number | null;
          compatibility?: string;
          current_version: string;
          release_date?: string | null;
          initial_release_date?: string | null;
          published?: boolean;
          also_included_in_text?: string | null;
          updated_at?: string;
          category_id: number | null;
          complexity_id: number | null;
        };
        Update: {
          product_type?: "tool" | "bundle" | "project";
          prepared_identity?: import("./preparedTool").ToolIdentity | null;
          draft_request_id?: string | null;
          id?: number;
          created_at?: string;
          name?: string;
          slug?: string;
          subtitle?: string;
          description?: string;
          price_eur?: number | null;
          compatibility?: string;
          current_version?: string;
          release_date?: string | null;
          initial_release_date?: string | null;
          published?: boolean;
          also_included_in_text?: string | null;
          updated_at?: string;
          category_id?: number | null;
          complexity_id?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "category";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "products_complexity_id_fkey";
            columns: ["complexity_id"];
            isOneToOne: false;
            referencedRelation: "complexity";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          user_id: string;
          name: string | null;
          invoice_details: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          name?: string | null;
          invoice_details?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          name?: string | null;
          invoice_details?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      delete_unused_product_draft: { Args: { p_admin_id: string; p_product_id: number; p_expected_updated_at: string }; Returns: { id: number } };
      product_publication_checks: { Args: { p_admin_id: string; p_product_id: number }; Returns: { missing: string[]; ready: boolean; updated_at: string } };
      record_product_download: { Args: { p_request_id: string; p_user_id: string; p_product_id: number; p_file_path: string }; Returns: boolean };
      read_admin_download_counts: { Args: { p_admin_id: string }; Returns: { free: number; paid: number; admin: number; total: number } };
      set_product_draft_card: { Args: { p_admin_id: string; p_product_id: number; p_expected_media_id: number | null; p_expected_updated_at: string; p_path: string }; Returns: { id: number; updated_at: string; media_id: number } };
      publish_product_draft: { Args: { p_admin_id: string; p_product_id: number; p_expected_updated_at: string; p_expected_price_id?: string | null }; Returns: { id: number; updated_at: string } };
      replace_prepared_tool_download: { Args: {p_admin_id:string;p_product_id:number;p_expected_path:string|null;p_file_path:string;p_file_name:string;p_identity:import("./preparedTool").ToolIdentity}; Returns:{ok:boolean} };
      import_prepared_tool: { Args: { p_admin_id:string; p_request_id:string; p_identity: import("./preparedTool").ToolIdentity }; Returns: {id:number;updated_at:string;name:string;slug:string} };
      save_product_draft: { Args: { p_admin_id: string; p_request_id: string; p_data: import("./productDraft").DraftInput; p_product_id?: number; p_expected_updated_at?: string }; Returns: { id: number; updated_at: string } };
      attach_product_draft_image: { Args: { p_admin_id: string; p_product_id: number; p_path: string }; Returns: { id: number; updated_at: string } };
      read_admin_orders: {
        Args: { p_admin_id: string; p_page: number; p_status: string; p_sort: string; p_direction: string };
        Returns: { page: number; hasMore: boolean; orders: {
          id: number; order_number: string | null; user_id: string;
          customerEmail: string | null; customerName: string | null;
          provider: string; provider_order_id: string | null; provider_transaction_id: string | null;
          status: string; currency: string; subtotal: number; total: number;
          created_at: string; provider_created_at: string | null;
          items: { id: number; product_id: number; quantity: number; unit_price: number;
            product: { id: number; name: string; slug: string } | null }[];
        }[] };
      };
      set_bundle_download: {
        Args: { p_admin_id:string; p_product_id:number; p_expected_path:string|null; p_file_path:string; p_file_name:string; p_tool_ids:number[] };
        Returns: { ok:boolean; code?:string };
      };
      set_product_download: {
        Args: { p_admin_id: string; p_product_id: number; p_expected_path: string | null; p_file_path: string | null; p_file_name: string | null; p_enabled: boolean };
        Returns: { ok: boolean; code?: string };
      };
      acquire_free_items: {
        Args: { p_user_id: string; p_product_ids: number[] };
        Returns: { ok: boolean; code?: string; products?: { id: number; name: string; slug: string }[] };
      };
      renew_account_license: {
        Args: { p_activation_id: number; p_credential_id: string; p_machine_id: string };
        Returns: { ok: boolean; code?: string; activation?: { id: number; machine_id: string; credential_id: string; activated_at: string }; products?: { id: number; slug: string; name: string }[] };
      };
      get_account_activation_secret: {
        Args: { p_user_id: string; p_expected_id: string };
        Returns: { ok: boolean; code?: string; encrypted_key?: string; secret_hash?: string };
      };
      set_account_activation_credential: {
        Args: { p_user_id: string; p_secret_hash: string; p_key_prefix: string; p_expected_id: string | null; p_encrypted_key: string };
        Returns: { ok: boolean; code?: string; credential?: { id: string; key_prefix: string; created_at: string; updated_at: string; reveal_available: boolean } };
      };
      activate_account_machine: {
        Args: { p_secret_hash: string; p_machine_id: string };
        Returns: { ok: boolean; code?: string; activation?: { id: number; machine_id: string; credential_id: string; activated_at: string }; products?: { id: number; slug: string; name: string }[] };
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
