import Config

if config_env() == :prod do
  config :gralkor_ex,
    data_dir: System.fetch_env!("GRALKOR_DATA_DIR"),
    llm_model: System.get_env("GRALKOR_LLM_MODEL"),
    embedder_model: System.get_env("GRALKOR_EMBEDDER_MODEL")
end
