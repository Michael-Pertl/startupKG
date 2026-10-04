export type NodeKind = "startup" | "investor" | "round" | "country" | "region" | "domain" | "year";

export type MarketNode = {
  id: string;
  label: string;
  kind: NodeKind;
  region?: string;
  country?: string;
  domain?: string;
  year?: string;
  amount_usd?: number;
  visible_mega_round_funding_usd?: number;
  linked_funding_usd?: number;
  importance_score?: number;
  mega_round_count?: number;
  participated_rounds?: number;
  lead_rounds?: number;
  confidence?: string;
  source_url?: string;
  source_type?: string;
  round_type?: string;
  round_date?: string;
  startup_name?: string;
  investor_type?: string;
  profile_enriched?: boolean;
  profile_confidence?: string;
  website?: string;
  notable_products?: string;
  trajectory_label?: string;
  [key: string]: string | number | boolean | undefined;
};

export type MarketEdge = {
  id: string;
  source: string;
  target: string;
  kind: string;
  role?: string;
  year?: string;
  amount_usd?: number;
  linked_round_usd?: number;
  participation_role?: string;
  participation_weight?: number;
  allocation_basis?: string;
  shared_rounds?: number;
  linked_funding_usd?: number;
};

export type MarketGraph = {
  metadata: {
    title: string;
    round_count: number;
    startup_count: number;
    investor_count: number;
    edge_count: number;
    scope_note: string;
    generated_at?: string;
    latest_funding_date?: string;
  };
  facets: {
    years: string[];
    regions: string[];
    countries: string[];
    domains: string[];
    confidence: string[];
  };
  nodes: MarketNode[];
  edges: MarketEdge[];
};

export type MarketEvent = {
  event_id: string;
  company_name: string;
  event_type: string;
  ipo_stage?: string;
  event_date: string;
  year: string;
  country: string;
  region: string;
  amount_usd?: number | null;
  valuation_usd?: number | null;
  source_url: string;
  source_type: string;
  confidence: string;
  status: string;
  signal_tier: string;
  signal_label: string;
  linked_startup_id?: string | null;
  linked_startup_label?: string | null;
  summary: string;
  notes: string;
};

export type MarketEventFeed = {
  metadata: {
    title: string;
    event_count: number;
    scope_note: string;
  };
  facets: {
    event_types: string[];
    ipo_stages?: string[];
    regions: string[];
    confidence: string[];
    statuses: string[];
    signal_tiers: string[];
  };
  events: MarketEvent[];
};

export type Filters = {
  years: string[];
  regions: string[];
  domains: string[];
  confidence: string[];
  nodeKinds: NodeKind[];
};
