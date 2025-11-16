create table if not exists agent_knowledge_packs (
  agent_id uuid not null references agents(id) on delete cascade,
  knowledge_pack_id uuid not null references knowledge_packs(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (agent_id, knowledge_pack_id)
);

create index if not exists agent_knowledge_packs_agent_idx on agent_knowledge_packs (agent_id);
create index if not exists agent_knowledge_packs_kp_idx on agent_knowledge_packs (knowledge_pack_id);

