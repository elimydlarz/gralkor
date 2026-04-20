import Config

config :logger, level: :warning

config :gralkor_ex,
  client_http: [
    url: "http://gralkor.test",
    plug: {Req.Test, :gralkor_stub}
  ]
