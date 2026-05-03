Gralkor.TestEnv.load(Path.expand("../.env", __DIR__))

ExUnit.start(trace: true, exclude: [:integration, :functional])
