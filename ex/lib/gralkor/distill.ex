defmodule Gralkor.Distill do
  @moduledoc """
  Render a list of conversation turns into an episode body suitable for
  ingesting into the knowledge graph.

  Each turn that contains a `"behaviour"` message gets distilled by the
  configured LLM into a first-person past-tense summary and rendered as
  `Assistant: (behaviour: {summary})` before the assistant text. Turns
  without behaviour skip the LLM entirely.

  Distillation per turn is best-effort: any failure (LLM error, exception)
  drops the behaviour line for that turn and preserves the user/assistant
  text — the surrounding turns still produce output.

  Turns with behaviour are distilled in parallel via `Task.async_stream`.

  See `ex-format-transcript` in `gralkor/TEST_TREES.md`.
  """

  alias Gralkor.Message

  @type turn :: [Message.t()]
  @type distill_fn :: (String.t() -> {:ok, String.t()} | {:error, term()}) | nil

  @parallel_timeout 60_000

  @doc """
  Render `turns` (a list of turns; each turn a list of canonical Messages)
  into the episode body string.

  `distill_fn` is the LLM caller used to summarise behaviour messages. Pass
  `nil` to skip distillation entirely (behaviour lines are silently omitted).
  """
  @spec format_transcript([turn()], distill_fn()) :: String.t()
  def format_transcript(turns, distill_fn) when is_list(turns) do
    turns
    |> distill_in_parallel(distill_fn)
    |> Enum.map(&render_turn/1)
    |> Enum.join("\n")
  end

  @doc """
  Schema for the structured-output response the LLM returns when distilling
  a behaviour-containing turn.

  Used by callers that wire `format_transcript/2` up to req_llm:

      schema = Gralkor.Distill.distill_schema()
      {:ok, response} = ReqLLM.generate_object(model, prompt, schema)
      ReqLLM.Response.object(response).behaviour
  """
  @spec distill_schema() :: keyword()
  def distill_schema do
    [
      behaviour: [
        type: :string,
        required: true,
        doc:
          "First-person past-tense summary of what the agent did during this turn (its thinking, tool calls, tool results)."
      ]
    ]
  end

  # ── internal ────────────────────────────────────────────────

  defp distill_in_parallel(turns, distill_fn) do
    turns
    |> Enum.map(fn turn -> {turn, has_behaviour?(turn)} end)
    |> Task.async_stream(
      fn
        {turn, false} -> {turn, nil}
        {turn, true} -> {turn, safe_distill(distill_fn, turn)}
      end,
      ordered: true,
      timeout: @parallel_timeout
    )
    |> Enum.map(fn {:ok, result} -> result end)
  end

  defp has_behaviour?(turn), do: Enum.any?(turn, &(&1.role == "behaviour"))

  defp safe_distill(nil, _turn), do: nil

  defp safe_distill(distill_fn, turn) do
    distill_fn.(thinking_prompt(turn))
  rescue
    _ -> {:error, :raised}
  catch
    _, _ -> {:error, :raised}
  else
    {:ok, summary} when is_binary(summary) -> {:ok, summary}
    {:error, _} = err -> err
    other -> {:error, {:unexpected_distill_response, other}}
  end

  defp thinking_prompt(turn) do
    turn
    |> Enum.map(&("#{role_label(&1.role)}: #{&1.content}"))
    |> Enum.join("\n")
  end

  defp role_label("user"), do: "User"
  defp role_label("assistant"), do: "Assistant"
  defp role_label("behaviour"), do: "Agent did"

  defp render_turn({turn, distill_result}) do
    user_assistant = render_user_assistant(turn)
    behaviour_line = render_behaviour_line(distill_result)

    case behaviour_line do
      nil -> user_assistant
      line -> insert_behaviour_before_assistant(user_assistant, line)
    end
  end

  defp render_user_assistant(turn) do
    turn
    |> Enum.reject(&(&1.role == "behaviour"))
    |> Enum.map(&("#{role_label(&1.role)}: #{&1.content}"))
    |> Enum.join("\n")
  end

  defp render_behaviour_line({:ok, summary}), do: "Assistant: (behaviour: #{summary})"
  defp render_behaviour_line(_), do: nil

  defp insert_behaviour_before_assistant(user_assistant, behaviour_line) do
    case String.split(user_assistant, "\nAssistant:", parts: 2) do
      [before, rest] -> "#{before}\n#{behaviour_line}\nAssistant:#{rest}"
      [only] -> "#{behaviour_line}\n#{only}"
    end
  end
end
