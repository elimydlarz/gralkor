import Config

config :logger, level: :warning

config :gralkor,
  client_http: [
    url: "http://gralkor.test",
    plug: {Req.Test, :gralkor_stub}
  ]
