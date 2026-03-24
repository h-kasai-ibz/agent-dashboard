PRICING = {
    "claude-opus-4-6":   {"input": 15.0,  "output": 75.0,  "cache_write": 18.75, "cache_read": 1.50},
    "claude-sonnet-4-6": {"input": 3.0,   "output": 15.0,  "cache_write": 3.75,  "cache_read": 0.30},
    "claude-haiku-4-5":  {"input": 0.80,  "output": 4.0,   "cache_write": 1.0,   "cache_read": 0.08},
    "gemini-2.5-pro":    {"input": 1.25,  "output": 10.0,  "cache_write": 0.0,   "cache_read": 0.0},
    "gemini-2.5-flash":  {"input": 0.075, "output": 0.30,  "cache_write": 0.0,   "cache_read": 0.0},
}

DEFAULT_PRICING = {"input": 3.0, "output": 15.0, "cache_write": 3.75, "cache_read": 0.30}


def calculate_cost(
    model: str,
    input_tokens: int,
    output_tokens: int,
    cache_write_tokens: int = 0,
    cache_read_tokens: int = 0,
) -> float:
    pricing = PRICING.get(model, DEFAULT_PRICING)
    cost = (
        input_tokens * pricing["input"] / 1_000_000
        + output_tokens * pricing["output"] / 1_000_000
        + cache_write_tokens * pricing["cache_write"] / 1_000_000
        + cache_read_tokens * pricing["cache_read"] / 1_000_000
    )
    return round(cost, 6)
