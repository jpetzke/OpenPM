/**
 * Client-side pricing constants mirroring backend agent_config.py.
 * Used for hypothetical cost comparisons in the usage dashboard.
 */
export interface ModelPricing {
  input: number;   // USD per 1k tokens
  output: number;  // USD per 1k tokens
}

export const PRICING: Record<string, ModelPricing> = {
  "openai/gpt-4o":                  { input: 0.0025,  output: 0.01    },
  "openai/gpt-4o-mini":             { input: 0.00015, output: 0.0006  },
  "anthropic/claude-3.5-sonnet":    { input: 0.003,   output: 0.015   },
  "anthropic/claude-3-haiku":       { input: 0.00025, output: 0.00125 },
  "anthropic/claude-sonnet-4":      { input: 0.003,   output: 0.015   },
  "anthropic/claude-haiku-4.5":     { input: 0.001,   output: 0.005   },
  "google/gemini-2.5-flash":        { input: 0.0003,  output: 0.0025  },
  "google/gemini-2.5-pro":          { input: 0.00125, output: 0.005   },
  "meta-llama/llama-3.3-70b":       { input: 0.00023, output: 0.0004  },
  "qwen/qwen-2.5-72b":              { input: 0.00023, output: 0.0004  },
};

export const FALLBACK_PRICING: ModelPricing = { input: 0.001, output: 0.003 };
