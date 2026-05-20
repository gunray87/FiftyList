export type ProviderErrorInfo = {
	userMessage: string;
	code: string;
	retryable: boolean;
};

export function classifyProviderError(e: unknown): ProviderErrorInfo {
	const errMsg = e instanceof Error ? e.message : String(e);
	const lower = errMsg.toLowerCase();

	if (lower.includes('529') || lower.includes('overloaded')) {
		return {
			code: 'overloaded',
			retryable: true,
			userMessage: "Anthropic's API is temporarily overloaded. Please try again in a minute.",
		};
	}
	if (lower.includes('429') || lower.includes('rate limit')) {
		return {
			code: 'rate_limit',
			retryable: true,
			userMessage: 'Rate limit reached. Please try again shortly.',
		};
	}
	if (lower.includes('timeout') || lower.includes('timed out')) {
		return {
			code: 'timeout',
			retryable: true,
			userMessage: 'The AI request timed out. Please try again.',
		};
	}

	return {
		code: 'provider_error',
		retryable: false,
		userMessage: 'Claude inference failed.',
	};
}
