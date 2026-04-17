import Config

if config_env() == :prod do
  config :gralkor,
    data_dir: System.fetch_env!("GRALKOR_DATA_DIR"),
    server_dir: System.get_env("GRALKOR_SERVER_DIR", "/app/server"),
    server_url: System.get_env("GRALKOR_SERVER_URL", "http://127.0.0.1:4000"),
    auth_token: System.fetch_env!("GRALKOR_AUTH_TOKEN"),
    llm_provider: System.get_env("GRALKOR_LLM_PROVIDER", "gemini"),
    llm_model: System.get_env("GRALKOR_LLM_MODEL"),
    embedder_provider: System.get_env("GRALKOR_EMBEDDER_PROVIDER", "gemini"),
    embedder_model: System.get_env("GRALKOR_EMBEDDER_MODEL")
end
